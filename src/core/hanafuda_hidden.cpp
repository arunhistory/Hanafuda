#include <stdint.h>

extern "C" {
int game_state_size();
uint8_t* game_state_ptr();
int game_load(const uint8_t*,int);
int game_phase();
int game_turn();
int game_score(int);
int game_hand_n(int);
int game_hand_card(int,int);
int game_field_n();
int game_field_card(int);
int game_captured_n(int);
int game_captured_card(int,int);
int game_pending_match_n();
int game_pending_match_index(int);
int game_offered_score();
int game_koi_used();
int game_koi_enabled();
int game_last_round_winner();
int game_last_round_points();
int game_deck_remaining();
int game_deck_card_relative(int);
int game_play_hand(int,int);
int game_choose_capture(int,int);
int game_koi_decision(int,int);
int game_cpu_step(int,int,uint32_t);
int score_captured(const uint8_t*,int);
}

enum HiddenPhase : int {
  H_PLAY=1,
  H_CAPTURE_HAND=2,
  H_CAPTURE_DRAW=3,
  H_KOI=4,
  H_SETTLEMENT=5,
  H_COMPLETE=6,
};

static const int STATE_CAP=512;
static const int MAX_DEPTH=72;
static const int MAX_NODES=1200000;
static const int SCENARIOS=4;
static const uint32_t SCENARIO_SALTS[SCENARIOS]={0x243f6a88u,0x85a308d3u,0x13198a2eu,0x9e3779b9u};
static uint8_t root_state[STATE_CAP];
static uint8_t candidate_state[STATE_CAP];
static uint8_t search_states[MAX_DEPTH][STATE_CAP];
static int hidden_actor=0;
static int root_score_hidden=0;
static int root_score_opp=0;
static int search_nodes=0;
static int last_nodes=0;
static int last_exact=1;
static uint32_t rollout_salt=0;

static int copy_state_out(uint8_t* dst){
  const int n=game_state_size();
  if(n<=0||n>STATE_CAP)return 0;
  const uint8_t* src=game_state_ptr();
  for(int i=0;i<n;i++)dst[i]=src[i];
  return n;
}

static int restore_state(const uint8_t* src){
  const int n=game_state_size();
  if(n<=0||n>STATE_CAP)return 0;
  return game_load(src,n)==0;
}

static uint32_t mix(uint32_t h,uint32_t v){
  h^=v+0x9e3779b9u+(h<<6)+(h>>2);
  h^=h<<13;h^=h>>17;h^=h<<5;
  return h?h:0x6d2b79f5u;
}

static uint32_t state_seed(){
  uint32_t h=0x811c9dc5u^rollout_salt;
  h=mix(h,(uint32_t)game_phase());
  h=mix(h,(uint32_t)game_turn());
  h=mix(h,(uint32_t)game_deck_remaining());
  for(int p=0;p<2;p++){
    h=mix(h,(uint32_t)game_hand_n(p));
    for(int i=0;i<game_hand_n(p);i++)h=mix(h,(uint32_t)(game_hand_card(p,i)+1));
    h=mix(h,(uint32_t)game_captured_n(p));
    for(int i=0;i<game_captured_n(p);i++)h=mix(h,(uint32_t)(game_captured_card(p,i)+1));
  }
  h=mix(h,(uint32_t)game_field_n());
  for(int i=0;i<game_field_n();i++)h=mix(h,(uint32_t)(game_field_card(i)+1));
  const int rem=game_deck_remaining();
  for(int i=0;i<rem;i++)h=mix(h,(uint32_t)(game_deck_card_relative(i)+1));
  return h;
}

static int score_cards(uint8_t* cards,int n){
  const int s=score_captured(cards,n);
  return s<0?0:s;
}

static int captured_score(int p){
  uint8_t cards[48];
  const int n=game_captured_n(p);
  if(n<0||n>48)return 0;
  for(int i=0;i<n;i++)cards[i]=(uint8_t)game_captured_card(p,i);
  return score_cards(cards,n);
}

static int attainable_yaku_ceiling(int p){
  const int opp=1-p;
  uint8_t unavailable[48]={0};
  for(int i=0;i<game_captured_n(opp);i++){
    const int c=game_captured_card(opp,i);
    if(c>=0&&c<48)unavailable[c]=1;
  }
  uint8_t cards[48];int n=0;
  for(int c=0;c<48;c++)if(!unavailable[c])cards[n++]=(uint8_t)c;
  return score_cards(cards,n);
}

static int visible_future_yaku_score(int p){
  uint8_t seen[48]={0};
  uint8_t cards[48];int n=0;
  for(int i=0;i<game_captured_n(p);i++){
    const int c=game_captured_card(p,i);
    if(c>=0&&c<48&&!seen[c]){seen[c]=1;cards[n++]=(uint8_t)c;}
  }
  for(int i=0;i<game_hand_n(p);i++){
    const int c=game_hand_card(p,i);
    if(c>=0&&c<48&&!seen[c]){seen[c]=1;cards[n++]=(uint8_t)c;}
  }
  for(int i=0;i<game_field_n();i++){
    const int c=game_field_card(i);
    if(c>=0&&c<48&&!seen[c]){seen[c]=1;cards[n++]=(uint8_t)c;}
  }
  const int rem=game_deck_remaining();
  for(int i=0;i<rem;i++){
    const int c=game_deck_card_relative(i);
    if(c>=0&&c<48&&!seen[c]){seen[c]=1;cards[n++]=(uint8_t)c;}
  }
  return score_cards(cards,n);
}

static int position_heuristic(){
  const int opp=1-hidden_actor;
  const int ownNow=captured_score(hidden_actor);
  const int oppNow=captured_score(opp);
  const int ownFuture=visible_future_yaku_score(hidden_actor);
  const int oppFuture=visible_future_yaku_score(opp);
  const int ownCeiling=attainable_yaku_ceiling(hidden_actor);
  const int oppCeiling=attainable_yaku_ceiling(opp);

  int value=0;
  value+=ownNow*900000;
  value-=oppNow*450000;
  value+=ownFuture*36000;
  value-=oppFuture*14000;
  value+=ownCeiling*8000;
  value-=oppCeiling*3000;
  if(game_phase()==H_KOI&&game_turn()==hidden_actor)value+=game_offered_score()*180000;
  if(game_koi_used())value+=ownFuture*12000;
  return value;
}

static int terminal_utility(){
  const int opp=1-hidden_actor;
  const int ownGain=game_score(hidden_actor)-root_score_hidden;
  const int oppGain=game_score(opp)-root_score_opp;
  const int winner=game_last_round_winner();
  if(winner==hidden_actor)return ownGain*1000000-oppGain*100000+100000;
  if(winner==opp)return -oppGain*450000;
  return -oppGain*150000;
}

static int hidden_search(int depth);

static void sort_actions(int* actions,int* priorities,int n){
  for(int i=0;i<n;i++)for(int j=i+1;j<n;j++)if(priorities[j]>priorities[i]){
    int t=priorities[i];priorities[i]=priorities[j];priorities[j]=t;
    t=actions[i];actions[i]=actions[j];actions[j]=t;
  }
}

static int search_hidden_choice(int depth){
  const int phase=game_phase();
  int actions[8],priorities[8],n=0;
  if(!copy_state_out(search_states[depth]))return position_heuristic();

  if(phase==H_PLAY){
    const int count=game_hand_n(hidden_actor);
    for(int i=0;i<count;i++){
      restore_state(search_states[depth]);
      if(game_play_hand(hidden_actor,i)==0){actions[n]=i;priorities[n]=position_heuristic();n++;}
    }
  }else if(phase==H_CAPTURE_HAND||phase==H_CAPTURE_DRAW){
    const int count=game_pending_match_n();
    for(int i=0;i<count;i++){
      const int fieldIndex=game_pending_match_index(i);
      restore_state(search_states[depth]);
      if(game_choose_capture(hidden_actor,fieldIndex)==0){actions[n]=fieldIndex;priorities[n]=position_heuristic();n++;}
    }
  }else if(phase==H_KOI){
    for(int choice=0;choice<=1;choice++){
      restore_state(search_states[depth]);
      if(game_koi_decision(hidden_actor,choice)==0){actions[n]=choice;priorities[n]=position_heuristic();n++;}
    }
  }
  restore_state(search_states[depth]);
  if(n==0)return position_heuristic();
  sort_actions(actions,priorities,n);

  int best=-2000000000;
  for(int i=0;i<n;i++){
    restore_state(search_states[depth]);
    int rc=-1;
    if(phase==H_PLAY)rc=game_play_hand(hidden_actor,actions[i]);
    else if(phase==H_CAPTURE_HAND||phase==H_CAPTURE_DRAW)rc=game_choose_capture(hidden_actor,actions[i]);
    else rc=game_koi_decision(hidden_actor,actions[i]);
    if(rc==0){
      const int v=hidden_search(depth+1);
      if(v>best)best=v;
    }
  }
  restore_state(search_states[depth]);
  return best==-2000000000?position_heuristic():best;
}

static int hidden_search(int depth){
  search_nodes++;
  if(search_nodes>MAX_NODES||depth>=MAX_DEPTH-1){last_exact=0;return position_heuristic();}
  const int phase=game_phase();
  if(phase==H_SETTLEMENT||phase==H_COMPLETE)return terminal_utility();
  const int turn=game_turn();
  if(turn==hidden_actor)return search_hidden_choice(depth);
  if(!copy_state_out(search_states[depth]))return position_heuristic();
  const int rc=game_cpu_step(turn,2,state_seed());
  int v=position_heuristic()-1000000;
  if(rc==0)v=hidden_search(depth+1);
  restore_state(search_states[depth]);
  return v;
}

static void score_candidate(int* worst,int* sum,int* peak){
  *worst=2000000000;*sum=0;*peak=-2000000000;
  if(!copy_state_out(candidate_state)){*worst=-2000000000;return;}
  int allExact=1;
  for(int scenario=0;scenario<SCENARIOS;scenario++){
    restore_state(candidate_state);
    rollout_salt=SCENARIO_SALTS[scenario];
    search_nodes=0;
    last_exact=1;
    const int v=hidden_search(1);
    last_nodes+=search_nodes;
    if(!last_exact)allExact=0;
    if(v<*worst)*worst=v;
    if(v>*peak)*peak=v;
    *sum+=v/SCENARIOS;
  }
  last_exact=allExact;
  restore_state(candidate_state);
}

static int better(int peak,int sum,int worst,int bestPeak,int bestSum,int bestWorst,int found){
  if(!found)return 1;
  // Humanly Impossible chooses the highest visible scoring route first.
  // Average and worst-case Pro tie-break outcomes only break ties between equal peak routes.
  if(peak!=bestPeak)return peak>bestPeak;
  if(sum!=bestSum)return sum>bestSum;
  return worst>bestWorst;
}

extern "C" {

__attribute__((visibility("default"))) int game_hidden_version(){return 4;}
__attribute__((visibility("default"))) int game_hidden_last_nodes(){return last_nodes;}
__attribute__((visibility("default"))) int game_hidden_last_exact(){return last_exact;}

__attribute__((visibility("default"))) int game_hidden_step(int actor){
  if(actor!=0&&actor!=1)return -3;
  if(actor!=game_turn())return -2;
  if(game_state_size()<=0||game_state_size()>STATE_CAP)return -5;
  hidden_actor=actor;
  root_score_hidden=game_score(actor);
  root_score_opp=game_score(1-actor);
  last_nodes=0;
  last_exact=1;
  if(!copy_state_out(root_state))return -5;

  const int phase=game_phase();
  int bestAction=-1,bestWorst=-2000000000,bestSum=-2000000000,bestPeak=-2000000000,found=0;

  if(phase==H_PLAY){
    const int n=game_hand_n(actor);
    for(int i=0;i<n;i++){
      restore_state(root_state);
      if(game_play_hand(actor,i)!=0)continue;
      int worst,sum,peak;score_candidate(&worst,&sum,&peak);
      if(better(peak,sum,worst,bestPeak,bestSum,bestWorst,found)){bestAction=i;bestPeak=peak;bestSum=sum;bestWorst=worst;found=1;}
    }
    restore_state(root_state);
    return found?game_play_hand(actor,bestAction):-1;
  }

  if(phase==H_CAPTURE_HAND||phase==H_CAPTURE_DRAW){
    const int n=game_pending_match_n();
    for(int i=0;i<n;i++){
      restore_state(root_state);
      const int fieldIndex=game_pending_match_index(i);
      if(game_choose_capture(actor,fieldIndex)!=0)continue;
      int worst,sum,peak;score_candidate(&worst,&sum,&peak);
      if(better(peak,sum,worst,bestPeak,bestSum,bestWorst,found)){bestAction=fieldIndex;bestPeak=peak;bestSum=sum;bestWorst=worst;found=1;}
    }
    restore_state(root_state);
    return found?game_choose_capture(actor,bestAction):-1;
  }

  if(phase==H_KOI){
    for(int choice=0;choice<=1;choice++){
      restore_state(root_state);
      if(game_koi_decision(actor,choice)!=0)continue;
      int worst,sum,peak;score_candidate(&worst,&sum,&peak);
      if(better(peak,sum,worst,bestPeak,bestSum,bestWorst,found)){bestAction=choice;bestPeak=peak;bestSum=sum;bestWorst=worst;found=1;}
    }
    restore_state(root_state);
    return found?game_koi_decision(actor,bestAction):-1;
  }

  restore_state(root_state);
  return -1;
}

}
