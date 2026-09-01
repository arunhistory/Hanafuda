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
uint32_t card_flags(int);
}

enum HiddenPhase : int { H_PLAY=1,H_CAPTURE_HAND=2,H_CAPTURE_DRAW=3,H_KOI=4,H_SETTLEMENT=5,H_COMPLETE=6 };
enum HiddenFlags : uint32_t { H_LIGHT=1u<<0,H_TANE=1u<<1,H_RIBBON=1u<<2,H_KASU=1u<<3,H_AKATAN=1u<<4,H_AOTAN=1u<<5,H_SAKE=1u<<6 };

static const int STATE_CAP=512;
static const int MAX_DEPTH=72;
static const int MAX_NODES=650000;
static const int SCENARIOS=1;
static const uint32_t SCENARIO_SALTS[SCENARIOS]={0x243f6a88u};
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

static int copy_state_out(uint8_t* dst){const int n=game_state_size();if(n<=0||n>STATE_CAP)return 0;const uint8_t* src=game_state_ptr();for(int i=0;i<n;i++)dst[i]=src[i];return n;}
static int restore_state(const uint8_t* src){const int n=game_state_size();if(n<=0||n>STATE_CAP)return 0;return game_load(src,n)==0;}
static uint32_t mix(uint32_t h,uint32_t v){h^=v+0x9e3779b9u+(h<<6)+(h>>2);h^=h<<13;h^=h>>17;h^=h<<5;return h?h:0x6d2b79f5u;}
static uint32_t state_seed(){uint32_t h=0x811c9dc5u^rollout_salt;h=mix(h,(uint32_t)game_phase());h=mix(h,(uint32_t)game_turn());h=mix(h,(uint32_t)game_deck_remaining());for(int p=0;p<2;p++){h=mix(h,(uint32_t)game_hand_n(p));for(int i=0;i<game_hand_n(p);i++)h=mix(h,(uint32_t)(game_hand_card(p,i)+1));h=mix(h,(uint32_t)game_captured_n(p));for(int i=0;i<game_captured_n(p);i++)h=mix(h,(uint32_t)(game_captured_card(p,i)+1));}h=mix(h,(uint32_t)game_field_n());for(int i=0;i<game_field_n();i++)h=mix(h,(uint32_t)(game_field_card(i)+1));const int rem=game_deck_remaining();for(int i=0;i<rem;i++)h=mix(h,(uint32_t)(game_deck_card_relative(i)+1));return h;}
static int captured_score(int p){uint8_t cards[48];const int n=game_captured_n(p);if(n<0||n>48)return 0;for(int i=0;i<n;i++)cards[i]=(uint8_t)game_captured_card(p,i);const int s=score_captured(cards,n);return s<0?0:s;}
static int strategic_count(int p,uint32_t flag){int n=0;for(int i=0;i<game_captured_n(p);i++)if(card_flags(game_captured_card(p,i))&flag)n++;return n;}
static int live_card_value(int id,int p){if(id<0||id>=48)return 0;const uint32_t f=card_flags(id);int v=0;if(f&H_LIGHT)v+=90+strategic_count(p,H_LIGHT)*24;if(f&H_TANE)v+=28+strategic_count(p,H_TANE)*7;if(f&H_RIBBON)v+=24+strategic_count(p,H_RIBBON)*7;if(f&H_KASU)v+=6+strategic_count(p,H_KASU)*2;if(f&H_AKATAN)v+=45;if(f&H_AOTAN)v+=45;if(f&H_SAKE)v+=60;if(id==24||id==37||id==21)v+=65;if(id==2||id==6||id==10)v+=55;if(id==22||id==34||id==38)v+=55;if(id==9||id==29||id==33)v+=55;return v;}
static int position_heuristic(){const int opp=1-hidden_actor;const int ownScore=captured_score(hidden_actor);const int oppScore=captured_score(opp);int value=(ownScore-oppScore)*12000;value+=(game_captured_n(hidden_actor)-game_captured_n(opp))*180;for(int i=0;i<game_hand_n(hidden_actor);i++)value+=live_card_value(game_hand_card(hidden_actor,i),hidden_actor)*12;for(int i=0;i<game_hand_n(opp);i++)value-=live_card_value(game_hand_card(opp,i),opp)*9;const int rem=game_deck_remaining();for(int i=0;i<rem&&i<8;i++){const int card=game_deck_card_relative(i);const int drawer=(game_turn()+i)%2;value+=(drawer==hidden_actor?1:-1)*live_card_value(card,drawer)*4;}if(game_phase()==H_KOI&&game_turn()==hidden_actor)value+=game_offered_score()*9000;if(game_koi_used())value+=(ownScore-oppScore)*2500;return value;}
static int terminal_utility(){const int opp=1-hidden_actor;const int ownGain=game_score(hidden_actor)-root_score_hidden;const int oppGain=game_score(opp)-root_score_opp;const int winner=game_last_round_winner();const int points=game_last_round_points();if(winner==hidden_actor)return 60000000+ownGain*300000+points*18000;if(winner==opp)return -180000000-oppGain*300000-points*15000;return -3000000+position_heuristic()/4;}

static int hidden_search(int depth);
static int search_hidden_choice(int depth){const int phase=game_phase();int best=-2000000000,found=0;if(phase==H_PLAY){const int n=game_hand_n(hidden_actor);for(int i=0;i<n;i++){if(!copy_state_out(search_states[depth]))return position_heuristic();const int rc=game_play_hand(hidden_actor,i);if(rc==0){const int v=hidden_search(depth+1);if(!found||v>best){best=v;found=1;}}restore_state(search_states[depth]);}}else if(phase==H_CAPTURE_HAND||phase==H_CAPTURE_DRAW){const int n=game_pending_match_n();for(int i=0;i<n;i++){const int fieldIndex=game_pending_match_index(i);if(!copy_state_out(search_states[depth]))return position_heuristic();const int rc=game_choose_capture(hidden_actor,fieldIndex);if(rc==0){const int v=hidden_search(depth+1);if(!found||v>best){best=v;found=1;}}restore_state(search_states[depth]);}}else if(phase==H_KOI){for(int choice=0;choice<=1;choice++){if(!copy_state_out(search_states[depth]))return position_heuristic();const int rc=game_koi_decision(hidden_actor,choice);if(rc==0){const int v=hidden_search(depth+1);if(!found||v>best){best=v;found=1;}}restore_state(search_states[depth]);}}return found?best:position_heuristic();}
static int hidden_search(int depth){search_nodes++;if(search_nodes>MAX_NODES||depth>=MAX_DEPTH-1){last_exact=0;return position_heuristic();}const int phase=game_phase();if(phase==H_SETTLEMENT||phase==H_COMPLETE)return terminal_utility();const int turn=game_turn();if(turn==hidden_actor)return search_hidden_choice(depth);if(!copy_state_out(search_states[depth]))return position_heuristic();const int rc=game_cpu_step(turn,2,state_seed());int v=position_heuristic()-5000000;if(rc==0)v=hidden_search(depth+1);restore_state(search_states[depth]);return v;}
static void score_candidate(int* worst,int* sum){*worst=2000000000;*sum=0;if(!copy_state_out(candidate_state)){*worst=-2000000000;return;}for(int scenario=0;scenario<SCENARIOS;scenario++){restore_state(candidate_state);rollout_salt=SCENARIO_SALTS[scenario];search_nodes=0;last_exact=1;const int v=hidden_search(1);last_nodes+=search_nodes;if(v<*worst)*worst=v;*sum+=v/SCENARIOS;}restore_state(candidate_state);}
static int better(int worst,int sum,int bestWorst,int bestSum,int found){if(!found)return 1;if(sum!=bestSum)return sum>bestSum;return worst>bestWorst;}

extern "C" {
__attribute__((visibility("default"))) int game_hidden_version(){return 3;}
__attribute__((visibility("default"))) int game_hidden_last_nodes(){return last_nodes;}
__attribute__((visibility("default"))) int game_hidden_last_exact(){return last_exact;}
__attribute__((visibility("default"))) int game_hidden_step(int actor){if(actor!=0&&actor!=1)return -3;if(actor!=game_turn())return -2;if(game_state_size()<=0||game_state_size()>STATE_CAP)return -5;hidden_actor=actor;root_score_hidden=game_score(actor);root_score_opp=game_score(1-actor);last_nodes=0;last_exact=1;if(!copy_state_out(root_state))return -5;const int phase=game_phase();int bestAction=-1,bestWorst=-2000000000,bestSum=-2000000000,found=0;if(phase==H_PLAY){const int n=game_hand_n(actor);for(int i=0;i<n;i++){restore_state(root_state);if(game_play_hand(actor,i)!=0)continue;int worst,sum;score_candidate(&worst,&sum);if(better(worst,sum,bestWorst,bestSum,found)){bestAction=i;bestWorst=worst;bestSum=sum;found=1;}}restore_state(root_state);return found?game_play_hand(actor,bestAction):-1;}if(phase==H_CAPTURE_HAND||phase==H_CAPTURE_DRAW){const int n=game_pending_match_n();for(int i=0;i<n;i++){restore_state(root_state);const int fieldIndex=game_pending_match_index(i);if(game_choose_capture(actor,fieldIndex)!=0)continue;int worst,sum;score_candidate(&worst,&sum);if(better(worst,sum,bestWorst,bestSum,found)){bestAction=fieldIndex;bestWorst=worst;bestSum=sum;found=1;}}restore_state(root_state);return found?game_choose_capture(actor,bestAction):-1;}if(phase==H_KOI){for(int choice=0;choice<=1;choice++){restore_state(root_state);if(game_koi_decision(actor,choice)!=0)continue;int worst,sum;score_candidate(&worst,&sum);if(better(worst,sum,bestWorst,bestSum,found)){bestAction=choice;bestWorst=worst;bestSum=sum;found=1;}}restore_state(root_state);return found?game_koi_decision(actor,bestAction):-1;}restore_state(root_state);return -1;}
}
