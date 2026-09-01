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
int card_month(int);
uint32_t card_flags(int);
uint32_t matching_field_mask(int,const uint8_t*,int);
}

enum HiddenPhase : int {
  H_PLAY=1,
  H_CAPTURE_HAND=2,
  H_CAPTURE_DRAW=3,
  H_KOI=4,
  H_SETTLEMENT=5,
  H_COMPLETE=6,
};

enum CardFlag : uint32_t {
  H_LIGHT=1u<<0,
  H_TANE=1u<<1,
  H_RIBBON=1u<<2,
  H_KASU=1u<<3,
  H_AKATAN=1u<<4,
  H_AOTAN=1u<<5,
  H_SAKE=1u<<6,
};

struct Eval { int worst; int avg; };

static const int STATE_CAP=512;
static const int MAX_DEPTH=72;
static const int MAX_NODES=1500000;
static uint8_t root_state[STATE_CAP];
static uint8_t search_states[MAX_DEPTH][STATE_CAP];
static int hidden_actor=0;
static int root_score_hidden=0;
static int root_score_opp=0;
static int search_nodes=0;
static int last_nodes=0;
static int last_exact=1;

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

static int contains_local(const uint8_t* cards,int n,int id){for(int i=0;i<n;i++)if(cards[i]==id)return 1;return 0;}
static int popcount32(uint32_t x){int n=0;while(x){n+=(int)(x&1u);x>>=1;}return n;}

static int score_cards(const uint8_t* cards,int n){
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

static Eval heuristic_eval(){const int v=position_heuristic();return {v,v};}

static Eval terminal_eval(){
  const int opp=1-hidden_actor;
  const int ownGain=game_score(hidden_actor)-root_score_hidden;
  const int oppGain=game_score(opp)-root_score_opp;
  const int winner=game_last_round_winner();
  int v;
  if(winner==hidden_actor)v=1000000000+ownGain*1000-oppGain;
  else if(winner==opp)v=-1000000000-oppGain*1000+ownGain;
  else v=-500000000+ownGain*1000-oppGain;
  return {v,v};
}

static int better_eval(Eval a,Eval b,int found){
  if(!found)return 1;
  const int safe=a.worst>0,bSafe=b.worst>0;
  if(safe!=bSafe)return safe>bSafe;
  if(safe){if(a.avg!=b.avg)return a.avg>b.avg;return a.worst>b.worst;}
  if(a.worst!=b.worst)return a.worst>b.worst;
  return a.avg>b.avg;
}

// Exact public Pro base-score model. Humanly Impossible never uses these values to value its own cards;
// they are used only to enumerate which Pro actions the real 0..3 / 0..1 tie-break noise can select.
static int intrinsic_value(int id){
  const uint32_t f=card_flags(id);int v=0;
  if(f&H_LIGHT)v+=42;if(f&H_TANE)v+=18;if(f&H_RIBBON)v+=12;
  if(f&H_AKATAN)v+=12;if(f&H_AOTAN)v+=12;if(f&H_SAKE)v+=18;if(f&H_KASU)v+=3;
  return v;
}
static int flag_count(const uint8_t* cards,int n,uint32_t flag){int c=0;for(int i=0;i<n;i++)if(card_flags(cards[i])&flag)c++;return c;}
static int set_progress(const uint8_t* cards,int n,int id,int a,int b,int c){
  if(id!=a&&id!=b&&id!=c)return 0;int have=0;
  if(id!=a&&contains_local(cards,n,a))have++;if(id!=b&&contains_local(cards,n,b))have++;if(id!=c&&contains_local(cards,n,c))have++;
  return have==2?58:have==1?16:4;
}
static int pair_progress(const uint8_t* cards,int n,int id,int a,int b){if(id!=a&&id!=b)return 0;return contains_local(cards,n,id==a?b:a)?38:5;}
static int progress_value(const uint8_t* cards,int n,int id){
  const uint32_t f=card_flags(id);int v=0;
  if(f&H_LIGHT)v+=8+flag_count(cards,n,H_LIGHT)*10;
  if(f&H_TANE)v+=4+flag_count(cards,n,H_TANE)*4;
  if(f&H_RIBBON)v+=4+flag_count(cards,n,H_RIBBON)*4;
  if(f&H_KASU)v+=2+flag_count(cards,n,H_KASU)*2;
  v+=set_progress(cards,n,id,24,37,21);
  v+=set_progress(cards,n,id,2,6,10);
  v+=set_progress(cards,n,id,22,34,38);
  v+=pair_progress(cards,n,id,9,33);
  v+=pair_progress(cards,n,id,29,33);
  return v;
}
static int projected_score_delta(const uint8_t* cards,int n,const uint8_t* additions,int add_n){
  if(n<0||n>48||add_n<0||n+add_n>48)return 0;
  uint8_t temp[48];for(int i=0;i<n;i++)temp[i]=cards[i];for(int i=0;i<add_n;i++)temp[n+i]=additions[i];
  return score_cards(temp,n+add_n)-score_cards(cards,n);
}
static int capture_bundle_value(const uint8_t* own,int own_n,const uint8_t* opp,int opp_n,const uint8_t* additions,int add_n){
  int v=0;for(int i=0;i<add_n;i++)v+=intrinsic_value(additions[i]);
  for(int i=0;i<add_n;i++)v+=progress_value(own,own_n,additions[i]);
  v+=projected_score_delta(own,own_n,additions,add_n)*22;
  for(int i=0;i<add_n;i++)v+=progress_value(opp,opp_n,additions[i])*2;
  v+=projected_score_delta(opp,opp_n,additions,add_n)*9;
  return v;
}

static void gather_cards(int actor,uint8_t hand[8],int* hand_n,uint8_t field[16],int* field_n,uint8_t own[48],int* own_n,uint8_t opp[48],int* opp_n){
  *hand_n=game_hand_n(actor);for(int i=0;i<*hand_n;i++)hand[i]=(uint8_t)game_hand_card(actor,i);
  *field_n=game_field_n();for(int i=0;i<*field_n;i++)field[i]=(uint8_t)game_field_card(i);
  *own_n=game_captured_n(actor);for(int i=0;i<*own_n;i++)own[i]=(uint8_t)game_captured_card(actor,i);
  *opp_n=game_captured_n(1-actor);for(int i=0;i<*opp_n;i++)opp[i]=(uint8_t)game_captured_card(1-actor,i);
}

static int pro_hand_base(int actor,int index){
  uint8_t hand[8],field[16],own[48],opp[48];int hand_n,field_n,own_n,opp_n;
  gather_cards(actor,hand,&hand_n,field,&field_n,own,&own_n,opp,&opp_n);
  if(index<0||index>=hand_n)return -1000000000;
  const int id=hand[index];const uint32_t mm=matching_field_mask(id,field,field_n);const int matches=popcount32(mm);int s=0;
  if(matches==0){
    s-=intrinsic_value(id)*2;s-=progress_value(opp,opp_n,id)*3;
    uint8_t add[1]={(uint8_t)id};s-=projected_score_delta(opp,opp_n,add,1)*12;
  }else if(matches==1){
    for(int j=0;j<field_n;j++)if(mm&(1u<<j)){uint8_t add[2]={(uint8_t)id,field[j]};s+=80+capture_bundle_value(own,own_n,opp,opp_n,add,2);break;}
  }else if(matches==2){
    int localBest=-1000000000;
    for(int j=0;j<field_n;j++)if(mm&(1u<<j)){uint8_t add[2]={(uint8_t)id,field[j]};const int x=capture_bundle_value(own,own_n,opp,opp_n,add,2);if(x>localBest)localBest=x;}
    s+=55+localBest;
  }else if(matches==3){
    uint8_t add[4];int k=0;add[k++]=(uint8_t)id;for(int j=0;j<field_n;j++)if(mm&(1u<<j))add[k++]=field[j];
    s+=170+capture_bundle_value(own,own_n,opp,opp_n,add,k);
  }
  s+=progress_value(own,own_n,id)*2;
  return s;
}

static int possible_pro_hand_actions(int actor,int out[8]){
  const int n=game_hand_n(actor);int base[8];for(int i=0;i<n;i++)base[i]=pro_hand_base(actor,i);
  int count=0;
  for(int i=0;i<n;i++){
    int possible=1;
    for(int j=0;j<n;j++)if(j!=i){
      if(j<i){if(base[i]+3<=base[j]){possible=0;break;}}
      else if(base[i]+3<base[j]){possible=0;break;}
    }
    if(possible)out[count++]=i;
  }
  return count;
}

static int infer_pending_card(){
  uint8_t present[48]={0};
  for(int p=0;p<2;p++){
    for(int i=0;i<game_hand_n(p);i++){const int c=game_hand_card(p,i);if(c>=0&&c<48)present[c]=1;}
    for(int i=0;i<game_captured_n(p);i++){const int c=game_captured_card(p,i);if(c>=0&&c<48)present[c]=1;}
  }
  for(int i=0;i<game_field_n();i++){const int c=game_field_card(i);if(c>=0&&c<48)present[c]=1;}
  for(int i=0;i<game_deck_remaining();i++){const int c=game_deck_card_relative(i);if(c>=0&&c<48)present[c]=1;}
  int missing=-1,count=0;for(int c=0;c<48;c++)if(!present[c]){missing=c;count++;}
  return count==1?missing:-1;
}

static int pro_capture_base(int actor,int fieldIndex,int played){
  uint8_t own[48],opp[48];int own_n=game_captured_n(actor),opp_n=game_captured_n(1-actor);
  for(int i=0;i<own_n;i++)own[i]=(uint8_t)game_captured_card(actor,i);
  for(int i=0;i<opp_n;i++)opp[i]=(uint8_t)game_captured_card(1-actor,i);
  const int fieldCard=game_field_card(fieldIndex);if(fieldCard<0||played<0)return -1000000000;
  uint8_t add[2]={(uint8_t)played,(uint8_t)fieldCard};
  return capture_bundle_value(own,own_n,opp,opp_n,add,2);
}

static int possible_pro_capture_actions(int actor,int out[3]){
  const int n=game_pending_match_n(),played=infer_pending_card();if(n<1||played<0)return 0;
  int base[3],idx[3];
  for(int i=0;i<n;i++){idx[i]=game_pending_match_index(i);base[i]=pro_capture_base(actor,idx[i],played);}
  int count=0;
  for(int i=0;i<n;i++){
    int possible=1;
    for(int j=0;j<n;j++)if(j!=i){
      if(j<i){if(base[i]+1<=base[j]){possible=0;break;}}
      else if(base[i]+1<base[j]){possible=0;break;}
    }
    if(possible)out[count++]=idx[i];
  }
  return count;
}

static Eval hidden_search(int depth);

static Eval search_hidden_choice(int depth){
  const int phase=game_phase();
  int actions[8],n=0;
  if(phase==H_PLAY){for(int i=0;i<game_hand_n(hidden_actor);i++)actions[n++]=i;}
  else if(phase==H_CAPTURE_HAND||phase==H_CAPTURE_DRAW){for(int i=0;i<game_pending_match_n();i++)actions[n++]=game_pending_match_index(i);}
  else if(phase==H_KOI){actions[n++]=0;actions[n++]=1;}
  else return heuristic_eval();
  if(!copy_state_out(search_states[depth]))return heuristic_eval();
  Eval best={-2000000000,-2000000000};int found=0;
  for(int i=0;i<n;i++){
    restore_state(search_states[depth]);int rc=-1;
    if(phase==H_PLAY)rc=game_play_hand(hidden_actor,actions[i]);
    else if(phase==H_CAPTURE_HAND||phase==H_CAPTURE_DRAW)rc=game_choose_capture(hidden_actor,actions[i]);
    else rc=game_koi_decision(hidden_actor,actions[i]);
    if(rc==0){const Eval v=hidden_search(depth+1);if(better_eval(v,best,found)){best=v;found=1;}}
  }
  restore_state(search_states[depth]);
  return found?best:heuristic_eval();
}

static Eval search_pro_choice(int depth){
  const int actor=game_turn(),phase=game_phase();int actions[8],n=0;
  if(phase==H_PLAY)n=possible_pro_hand_actions(actor,actions);
  else if(phase==H_CAPTURE_HAND||phase==H_CAPTURE_DRAW)n=possible_pro_capture_actions(actor,actions);
  if(!copy_state_out(search_states[depth]))return heuristic_eval();
  if(phase==H_KOI){
    const int rc=game_cpu_step(actor,2,0);Eval v=rc==0?hidden_search(depth+1):heuristic_eval();restore_state(search_states[depth]);return v;
  }
  if(n<=0){
    const int rc=game_cpu_step(actor,2,0);Eval v=rc==0?hidden_search(depth+1):heuristic_eval();restore_state(search_states[depth]);return v;
  }
  int worst=2000000000;int sum=0;int used=0;
  for(int i=0;i<n;i++){
    restore_state(search_states[depth]);int rc=-1;
    if(phase==H_PLAY)rc=game_play_hand(actor,actions[i]);
    else rc=game_choose_capture(actor,actions[i]);
    if(rc!=0)continue;
    const Eval v=hidden_search(depth+1);
    if(v.worst<worst)worst=v.worst;
    sum+=v.avg;used++;
  }
  restore_state(search_states[depth]);
  if(!used)return heuristic_eval();
  return {worst,sum/used};
}

static Eval hidden_search(int depth){
  search_nodes++;
  if(search_nodes>MAX_NODES||depth>=MAX_DEPTH-1){last_exact=0;return heuristic_eval();}
  const int phase=game_phase();
  if(phase==H_SETTLEMENT||phase==H_COMPLETE)return terminal_eval();
  return game_turn()==hidden_actor?search_hidden_choice(depth):search_pro_choice(depth);
}

static Eval score_candidate(){
  search_nodes=0;last_exact=1;const Eval v=hidden_search(1);last_nodes+=search_nodes;return v;
}

extern "C" {
__attribute__((visibility("default"))) int game_hidden_version(){return 8;}
__attribute__((visibility("default"))) int game_hidden_last_nodes(){return last_nodes;}
__attribute__((visibility("default"))) int game_hidden_last_exact(){return last_exact;}

__attribute__((visibility("default"))) int game_hidden_step(int actor){
  if(actor!=0&&actor!=1)return -3;
  if(actor!=game_turn())return -2;
  if(game_state_size()<=0||game_state_size()>STATE_CAP)return -5;
  hidden_actor=actor;root_score_hidden=game_score(actor);root_score_opp=game_score(1-actor);last_nodes=0;last_exact=1;
  if(!copy_state_out(root_state))return -5;
  const int phase=game_phase();int actions[8],n=0;
  if(phase==H_PLAY){for(int i=0;i<game_hand_n(actor);i++)actions[n++]=i;}
  else if(phase==H_CAPTURE_HAND||phase==H_CAPTURE_DRAW){for(int i=0;i<game_pending_match_n();i++)actions[n++]=game_pending_match_index(i);}
  else if(phase==H_KOI){actions[n++]=0;actions[n++]=1;}
  else return -1;
  int bestAction=-1;Eval best={-2000000000,-2000000000};int found=0;
  for(int i=0;i<n;i++){
    restore_state(root_state);int rc=-1;
    if(phase==H_PLAY)rc=game_play_hand(actor,actions[i]);
    else if(phase==H_CAPTURE_HAND||phase==H_CAPTURE_DRAW)rc=game_choose_capture(actor,actions[i]);
    else rc=game_koi_decision(actor,actions[i]);
    if(rc!=0)continue;
    const Eval v=score_candidate();
    if(better_eval(v,best,found)){best=v;bestAction=actions[i];found=1;}
  }
  restore_state(root_state);
  if(!found)return -1;
  if(phase==H_PLAY)return game_play_hand(actor,bestAction);
  if(phase==H_CAPTURE_HAND||phase==H_CAPTURE_DRAW)return game_choose_capture(actor,bestAction);
  return game_koi_decision(actor,bestAction);
}

}
