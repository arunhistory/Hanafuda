#include <stdint.h>
extern "C" void* memset(void* dst,int c,unsigned long n){unsigned char* p=(unsigned char*)dst;for(unsigned long i=0;i<n;i++)p[i]=(unsigned char)c;return dst;}

extern "C" int score_captured(const uint8_t*,int);
extern "C" uint32_t get_last_yaku_mask();
extern "C" int special_hand(const uint8_t*,int);
extern "C" int card_month(int);
extern "C" int choose_hand_index(const uint8_t*,int,const uint8_t*,int,const uint8_t*,int,const uint8_t*,int,int,uint32_t);
extern "C" int choose_capture_index(const uint8_t*,int,const uint8_t*,int,const uint8_t*,int,const uint8_t*,int,int,int,uint32_t);

enum Phase : uint8_t { PHASE_PLAY=1, PHASE_CHOOSE_HAND_CAPTURE=2, PHASE_CHOOSE_DRAW_CAPTURE=3, PHASE_KOI_DECISION=4, PHASE_ROUND_SETTLEMENT=5, PHASE_MATCH_COMPLETE=6 };
enum ResultCode : int { OK=0, ERR_PHASE=-1, ERR_TURN=-2, ERR_INDEX=-3, ERR_CHOICE=-4, ERR_STATE=-5 };

typedef struct __attribute__((packed)) GameState {
  uint32_t magic; uint16_t version; uint8_t total_rounds; uint8_t round_index; uint8_t dealer; uint8_t turn; uint8_t phase; uint8_t status;
  int32_t total_score[2]; uint32_t score_stamp[2]; uint32_t stamp_counter; uint32_t rng;
  uint8_t hand[2][8]; uint8_t hand_n[2]; uint8_t field[16]; uint8_t field_n; uint8_t deck[48]; uint8_t deck_pos;
  uint8_t captured[2][48]; uint8_t captured_n[2]; uint32_t yaku_mask[2]; int16_t yaku_score[2]; int16_t offered_score;
  uint8_t koi_used; uint8_t koi_caller; uint8_t pending_card; uint8_t pending_actor; uint8_t pending_matches[3]; uint8_t pending_match_n; uint8_t pending_source;
  uint8_t last_round_winner; int16_t last_round_points; uint8_t special_result[2]; uint8_t match_winner; uint8_t redeal_count; uint8_t koi_enabled; uint8_t reserved[24];
} GameState;

static GameState S; static uint8_t io_buffer[1024]; static const uint32_t MAGIC=0x48414E41u;
static uint32_t xr(){uint32_t x=S.rng?S.rng:0x9e3779b9u;x^=x<<13;x^=x>>17;x^=x<<5;S.rng=x;return x;}
static void fill_empty(uint8_t* p,int n){for(int i=0;i<n;i++)p[i]=255;}
static void clear_round(){fill_empty(&S.hand[0][0],16);S.hand_n[0]=S.hand_n[1]=0;fill_empty(S.field,16);S.field_n=0;fill_empty(S.deck,48);S.deck_pos=0;fill_empty(&S.captured[0][0],96);S.captured_n[0]=S.captured_n[1]=0;S.yaku_mask[0]=S.yaku_mask[1]=0;S.yaku_score[0]=S.yaku_score[1]=0;S.offered_score=0;S.koi_used=0;S.koi_caller=255;S.pending_card=255;S.pending_actor=255;S.pending_match_n=0;S.pending_source=0;S.last_round_winner=255;S.last_round_points=0;S.special_result[0]=S.special_result[1]=0;}
static void shuffle_deck(){for(int i=0;i<48;i++)S.deck[i]=(uint8_t)i;for(int i=47;i>0;i--){int j=(int)(xr()%((uint32_t)i+1u));uint8_t t=S.deck[i];S.deck[i]=S.deck[j];S.deck[j]=t;}S.deck_pos=0;}
static uint8_t draw_raw(){return S.deck_pos<48?S.deck[S.deck_pos++]:255;}
static void field_add(uint8_t c){if(c!=255&&S.field_n<16)S.field[S.field_n++]=c;}
static void captured_add(int p,uint8_t c){if(c!=255&&S.captured_n[p]<48)S.captured[p][S.captured_n[p]++]=c;}
static void field_remove_index(int idx){if(idx<0||idx>=S.field_n)return;for(int i=idx;i<S.field_n-1;i++)S.field[i]=S.field[i+1];S.field_n--;S.field[S.field_n]=255;}
static uint8_t hand_remove_index(int p,int idx){if(idx<0||idx>=S.hand_n[p])return 255;uint8_t c=S.hand[p][idx];for(int i=idx;i<S.hand_n[p]-1;i++)S.hand[p][i]=S.hand[p][i+1];S.hand_n[p]--;S.hand[p][S.hand_n[p]]=255;return c;}
static int collect_matches(uint8_t c,uint8_t out[3]){int n=0,m=card_month(c);for(int i=0;i<S.field_n&&n<3;i++)if(card_month(S.field[i])==m)out[n++]=(uint8_t)i;return n;}
static void capture_selected(int p,uint8_t played,int field_idx){uint8_t f=S.field[field_idx];field_remove_index(field_idx);captured_add(p,played);captured_add(p,f);}
static void capture_all_three(int p,uint8_t played,uint8_t idxs[3]){for(int i=0;i<3;i++)for(int j=i+1;j<3;j++)if(idxs[j]>idxs[i]){uint8_t t=idxs[i];idxs[i]=idxs[j];idxs[j]=t;}captured_add(p,played);for(int i=0;i<3;i++){uint8_t f=S.field[idxs[i]];field_remove_index(idxs[i]);captured_add(p,f);}}
static int field_has_four_month(){int cnt[13]={0};for(int i=0;i<S.field_n;i++){int m=card_month(S.field[i]);if(m>=1&&m<=12){cnt[m]++;if(cnt[m]>=4)return 1;}}return 0;}
static void deal_once(){const int child=1-S.dealer;for(int i=0;i<8;i++){field_add(draw_raw());S.hand[child][S.hand_n[child]++]=draw_raw();S.hand[S.dealer][S.hand_n[S.dealer]++]=draw_raw();}}
static void update_score_stamp(int p){S.stamp_counter++;S.score_stamp[p]=S.stamp_counter;}
static void finish_match_if_needed(){if(S.round_index<S.total_rounds)return;S.status=2;S.phase=PHASE_MATCH_COMPLETE;if(S.total_score[0]>S.total_score[1])S.match_winner=0;else if(S.total_score[1]>S.total_score[0])S.match_winner=1;else if(S.score_stamp[0]&&S.score_stamp[1]&&S.score_stamp[0]!=S.score_stamp[1])S.match_winner=S.score_stamp[0]<S.score_stamp[1]?0:1;else S.match_winner=255;}
static void begin_round(){clear_round();S.status=0;S.phase=PHASE_PLAY;S.turn=S.dealer;for(int tries=0;tries<32;tries++){clear_round();S.status=0;S.phase=PHASE_PLAY;S.turn=S.dealer;shuffle_deck();deal_once();if(field_has_four_month()){S.redeal_count++;continue;}S.special_result[0]=(uint8_t)special_hand(S.hand[0],8);S.special_result[1]=(uint8_t)special_hand(S.hand[1],8);if(S.special_result[0]||S.special_result[1]){if(S.special_result[0]&&S.special_result[1]){S.last_round_winner=2;S.last_round_points=0;S.status=1;S.phase=PHASE_ROUND_SETTLEMENT;return;}int w=S.special_result[0]?0:1;S.total_score[w]+=60;update_score_stamp(w);S.last_round_winner=(uint8_t)w;S.last_round_points=60;S.dealer=(uint8_t)w;S.status=1;S.phase=PHASE_ROUND_SETTLEMENT;return;}return;}S.last_round_winner=2;S.last_round_points=0;S.status=1;S.phase=PHASE_ROUND_SETTLEMENT;}
static void settle_round(int winner,int points){S.last_round_winner=(uint8_t)winner;S.last_round_points=(int16_t)points;S.status=1;S.phase=PHASE_ROUND_SETTLEMENT;if(winner==0||winner==1){S.total_score[winner]+=points;update_score_stamp(winner);S.dealer=(uint8_t)winner;}}
static void round_draw(){settle_round(2,0);} static void pass_turn(){S.turn=(uint8_t)(1-S.turn);S.phase=PHASE_PLAY;S.pending_card=255;S.pending_match_n=0;S.pending_source=0;S.offered_score=0;}
static void maybe_offer_or_pass(int p){int sc=score_captured(S.captured[p],S.captured_n[p]);uint32_t mask=get_last_yaku_mask();S.yaku_mask[p]=mask;if(sc>S.yaku_score[p]){S.offered_score=(int16_t)sc;int can_koi=S.koi_enabled&&(!S.koi_used)&&!(S.hand_n[0]<3&&S.hand_n[1]<3);if(can_koi){S.phase=PHASE_KOI_DECISION;return;}int pts=sc*(S.koi_used?2:1);settle_round(p,pts);return;}if(S.hand_n[0]==0&&S.hand_n[1]==0){round_draw();return;}pass_turn();}
static void resolve_draw(int p);
static void resolve_played_card(int p,uint8_t card,int source){uint8_t idxs[3]={0,0,0};int n=collect_matches(card,idxs);if(n==0){field_add(card);if(source==1)resolve_draw(p);else maybe_offer_or_pass(p);return;}if(n==1){capture_selected(p,card,idxs[0]);if(source==1)resolve_draw(p);else maybe_offer_or_pass(p);return;}if(n==3){capture_all_three(p,card,idxs);if(source==1)resolve_draw(p);else maybe_offer_or_pass(p);return;}S.pending_card=card;S.pending_actor=(uint8_t)p;S.pending_match_n=2;S.pending_matches[0]=idxs[0];S.pending_matches[1]=idxs[1];S.pending_source=(uint8_t)source;S.phase=(source==1)?PHASE_CHOOSE_HAND_CAPTURE:PHASE_CHOOSE_DRAW_CAPTURE;}
static void resolve_draw(int p){if(S.deck_pos>=48){maybe_offer_or_pass(p);return;}uint8_t c=draw_raw();resolve_played_card(p,c,2);}
static int public_cpu_koi(int actor,int difficulty,uint32_t seed){
  if(!S.koi_enabled||S.koi_used||(S.hand_n[0]<3&&S.hand_n[1]<3))return 0;
  const int offered=S.offered_score,opp=score_captured(S.captured[1-actor],S.captured_n[1-actor]);
  if(difficulty<=0)return offered<=20&&((xr()^seed)&3u)==0u;
  if(difficulty==1)return offered<=20&&S.hand_n[actor]>=4&&opp<40;
  if(offered>60||opp>=50||S.hand_n[actor]<=3)return 0;
  const int momentum=(int)S.captured_n[actor]-(int)S.captured_n[1-actor];
  if(offered<=20)return 1;
  return offered<=60&&momentum>=0;
}

extern "C" {
__attribute__((visibility("default"))) int game_state_size(){return (int)sizeof(GameState);}
__attribute__((visibility("default"))) uint8_t* game_state_ptr(){return (uint8_t*)&S;}
__attribute__((visibility("default"))) uint8_t* game_io_buffer(){return io_buffer;}
__attribute__((visibility("default"))) int game_load(const uint8_t* p,int n){if(n!=(int)sizeof(GameState))return ERR_STATE;uint8_t* d=(uint8_t*)&S;for(int i=0;i<n;i++)d[i]=p[i];return(S.magic==MAGIC&&S.version==1)?OK:ERR_STATE;}
__attribute__((visibility("default"))) int game_new(uint32_t seed,int total_rounds,int first_dealer,int koi_enabled){if(total_rounds<1||total_rounds>12||(koi_enabled!=0&&koi_enabled!=1))return ERR_STATE;uint8_t* d=(uint8_t*)&S;for(unsigned i=0;i<sizeof(GameState);i++)d[i]=0;S.magic=MAGIC;S.version=1;S.total_rounds=(uint8_t)total_rounds;S.rng=seed?seed:0x13572468u;S.dealer=(first_dealer==0||first_dealer==1)?(uint8_t)first_dealer:(uint8_t)(xr()&1u);S.koi_enabled=(uint8_t)koi_enabled;S.match_winner=255;S.score_stamp[0]=S.score_stamp[1]=0;S.stamp_counter=0;S.round_index=0;begin_round();return OK;}
__attribute__((visibility("default"))) int game_play_hand(int actor,int hand_index){if(S.phase!=PHASE_PLAY)return ERR_PHASE;if(actor!=S.turn)return ERR_TURN;if(hand_index<0||hand_index>=S.hand_n[actor])return ERR_INDEX;uint8_t c=hand_remove_index(actor,hand_index);resolve_played_card(actor,c,1);return OK;}
__attribute__((visibility("default"))) int game_choose_capture(int actor,int field_index){if(S.phase!=PHASE_CHOOSE_HAND_CAPTURE&&S.phase!=PHASE_CHOOSE_DRAW_CAPTURE)return ERR_PHASE;if(actor!=S.pending_actor||actor!=S.turn)return ERR_TURN;int valid=0;for(int i=0;i<S.pending_match_n;i++)if(S.pending_matches[i]==field_index)valid=1;if(!valid)return ERR_CHOICE;uint8_t source=S.pending_source,card=S.pending_card;capture_selected(actor,card,field_index);S.pending_card=255;S.pending_match_n=0;S.pending_source=0;if(source==1)resolve_draw(actor);else maybe_offer_or_pass(actor);return OK;}
__attribute__((visibility("default"))) int game_koi_decision(int actor,int choose_koi){if(S.phase!=PHASE_KOI_DECISION)return ERR_PHASE;if(actor!=S.turn)return ERR_TURN;if(choose_koi){if(!S.koi_enabled||S.koi_used||(S.hand_n[0]<3&&S.hand_n[1]<3))return ERR_CHOICE;S.koi_used=1;S.koi_caller=(uint8_t)actor;S.yaku_score[actor]=S.offered_score;pass_turn();return OK;}int pts=S.offered_score*(S.koi_used?2:1);S.yaku_score[actor]=S.offered_score;settle_round(actor,pts);return OK;}
__attribute__((visibility("default"))) int game_next_round(){if(S.phase!=PHASE_ROUND_SETTLEMENT)return ERR_PHASE;S.round_index++;finish_match_if_needed();if(S.phase==PHASE_MATCH_COMPLETE)return OK;begin_round();return OK;}
__attribute__((visibility("default"))) int game_cpu_step(int actor,int difficulty,uint32_t seed){if(actor!=S.turn)return ERR_TURN;if(S.phase==PHASE_PLAY){int idx=choose_hand_index(S.hand[actor],S.hand_n[actor],S.field,S.field_n,S.captured[actor],S.captured_n[actor],S.captured[1-actor],S.captured_n[1-actor],difficulty,seed);return game_play_hand(actor,idx);}if(S.phase==PHASE_CHOOSE_HAND_CAPTURE||S.phase==PHASE_CHOOSE_DRAW_CAPTURE){int best=choose_capture_index(S.field,S.field_n,S.pending_matches,S.pending_match_n,S.captured[actor],S.captured_n[actor],S.captured[1-actor],S.captured_n[1-actor],difficulty,S.pending_card,seed);return game_choose_capture(actor,best);}if(S.phase==PHASE_KOI_DECISION)return game_koi_decision(actor,public_cpu_koi(actor,difficulty,seed));return ERR_PHASE;}
__attribute__((visibility("default"))) int game_phase(){return S.phase;} __attribute__((visibility("default"))) int game_status(){return S.status;} __attribute__((visibility("default"))) int game_turn(){return S.turn;} __attribute__((visibility("default"))) int game_dealer(){return S.dealer;} __attribute__((visibility("default"))) int game_round_index(){return S.round_index;} __attribute__((visibility("default"))) int game_total_rounds(){return S.total_rounds;}
__attribute__((visibility("default"))) int game_score(int p){return(p==0||p==1)?S.total_score[p]:-1;} __attribute__((visibility("default"))) int game_hand_n(int p){return(p==0||p==1)?S.hand_n[p]:0;} __attribute__((visibility("default"))) int game_hand_card(int p,int i){return(p==0||p==1)&&i>=0&&i<S.hand_n[p]?S.hand[p][i]:-1;} __attribute__((visibility("default"))) int game_field_n(){return S.field_n;} __attribute__((visibility("default"))) int game_field_card(int i){return i>=0&&i<S.field_n?S.field[i]:-1;} __attribute__((visibility("default"))) int game_captured_n(int p){return(p==0||p==1)?S.captured_n[p]:0;} __attribute__((visibility("default"))) int game_captured_card(int p,int i){return(p==0||p==1)&&i>=0&&i<S.captured_n[p]?S.captured[p][i]:-1;} __attribute__((visibility("default"))) int game_pending_match_n(){return S.pending_match_n;} __attribute__((visibility("default"))) int game_pending_match_index(int i){return i>=0&&i<S.pending_match_n?S.pending_matches[i]:-1;} __attribute__((visibility("default"))) int game_offered_score(){return S.offered_score;} __attribute__((visibility("default"))) int game_koi_used(){return S.koi_used;} __attribute__((visibility("default"))) int game_koi_enabled(){return S.koi_enabled;} __attribute__((visibility("default"))) int game_last_round_winner(){return S.last_round_winner;} __attribute__((visibility("default"))) int game_last_round_points(){return S.last_round_points;} __attribute__((visibility("default"))) int game_special_result(int p){return(p==0||p==1)?S.special_result[p]:0;} __attribute__((visibility("default"))) int game_match_winner(){return S.match_winner;} __attribute__((visibility("default"))) int game_deck_remaining(){return 48-S.deck_pos;} __attribute__((visibility("default"))) int game_deck_card_relative(int i){int idx=(int)S.deck_pos+i;return i>=0&&idx>=0&&idx<48?S.deck[idx]:-1;}
}
