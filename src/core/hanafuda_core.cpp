#include <stdint.h>

extern "C" {

enum CardFlag : uint32_t {
  LIGHT  = 1u << 0,
  TANE   = 1u << 1,
  RIBBON = 1u << 2,
  KASU   = 1u << 3,
  AKATAN = 1u << 4,
  AOTAN  = 1u << 5,
  SAKE   = 1u << 6,
};

enum YakuMask : uint32_t {
  Y_GOKO       = 1u << 0,
  Y_SHIKO      = 1u << 1,
  Y_AMESHIKO   = 1u << 2,
  Y_SANKO      = 1u << 3,
  Y_INOSHIKA   = 1u << 4,
  Y_AKATAN     = 1u << 5,
  Y_AOTAN      = 1u << 6,
  Y_HANAMI     = 1u << 7,
  Y_TSUKIMI    = 1u << 8,
  Y_TAN        = 1u << 9,
  Y_TANE       = 1u << 10,
  Y_KASU       = 1u << 11,
};

static uint32_t g_last_yaku_mask = 0;
static uint8_t g_buffer[256];

__attribute__((visibility("default"))) int core_version(){ return 3; }
__attribute__((visibility("default"))) uint8_t* get_buffer(){ return g_buffer; }
__attribute__((visibility("default"))) uint32_t get_last_yaku_mask(){ return g_last_yaku_mask; }
__attribute__((visibility("default"))) int card_month(int id){ return (id>=0 && id<48) ? (id/4)+1 : 0; }

__attribute__((visibility("default"))) uint32_t card_flags(int id){
  switch(id){
    case 0: return KASU; case 1: return LIGHT; case 2: return RIBBON|AKATAN; case 3: return KASU;
    case 4: return KASU; case 5: return KASU; case 6: return RIBBON|AKATAN; case 7: return TANE;
    case 8: return KASU; case 9: return LIGHT; case 10:return RIBBON|AKATAN; case 11:return KASU;
    case 12:return TANE; case 13:return KASU; case 14:return RIBBON; case 15:return KASU;
    case 16:return KASU; case 17:return KASU; case 18:return RIBBON; case 19:return TANE;
    case 20:return KASU; case 21:return TANE; case 22:return RIBBON|AOTAN; case 23:return KASU;
    case 24:return TANE; case 25:return KASU; case 26:return RIBBON; case 27:return KASU;
    case 28:return KASU; case 29:return LIGHT; case 30:return TANE; case 31:return KASU;
    case 32:return KASU; case 33:return TANE|KASU|SAKE; case 34:return RIBBON|AOTAN; case 35:return KASU;
    case 36:return KASU; case 37:return TANE; case 38:return RIBBON|AOTAN; case 39:return KASU;
    case 40:return KASU; case 41:return TANE; case 42:return RIBBON; case 43:return LIGHT;
    case 44:return KASU; case 45:return LIGHT; case 46:return KASU; case 47:return KASU;
    default:return 0;
  }
}

static int contains(const uint8_t* cards,int n,int id){for(int i=0;i<n;i++)if(cards[i]==id)return 1;return 0;}

__attribute__((visibility("default"))) int score_captured(const uint8_t* cards,int n){
  if(n<0||n>48){g_last_yaku_mask=0;return -1;}
  int light=0,ribbons=0,tane=0,kasu=0;
  int hasRain=0;
  for(int i=0;i<n;i++){
    const int id=cards[i]; if(id<0||id>=48){g_last_yaku_mask=0;return -1;}
    const uint32_t f=card_flags(id);
    if(f&LIGHT){light++; if(id==43)hasRain=1;}
    if(f&RIBBON)ribbons++;
    if(f&TANE)tane++;
    if(f&KASU)kasu++;
  }
  int score=0; uint32_t mask=0;
  if(light==5){score+=100;mask|=Y_GOKO;}
  else if(light>=4 && !hasRain){score+=90;mask|=Y_SHIKO;}
  else if(light>=4 && hasRain){score+=70;mask|=Y_AMESHIKO;}
  else if(light>=3 && !hasRain){score+=40;mask|=Y_SANKO;}

  if(contains(cards,n,24)&&contains(cards,n,37)&&contains(cards,n,21)){score+=60;mask|=Y_INOSHIKA;}
  if(contains(cards,n,2)&&contains(cards,n,6)&&contains(cards,n,10)){score+=50;mask|=Y_AKATAN;}
  if(contains(cards,n,22)&&contains(cards,n,34)&&contains(cards,n,38)){score+=50;mask|=Y_AOTAN;}
  if(contains(cards,n,9)&&contains(cards,n,33)){score+=40;mask|=Y_HANAMI;}
  if(contains(cards,n,29)&&contains(cards,n,33)){score+=40;mask|=Y_TSUKIMI;}
  if(ribbons>=5){score+=30;mask|=Y_TAN;}
  if(tane>=5){score+=10+(tane-5)*5;mask|=Y_TANE;}
  if(kasu>=5){score+=10+(kasu-5)*5;mask|=Y_KASU;}
  g_last_yaku_mask=mask;
  return score;
}

__attribute__((visibility("default"))) int special_hand(const uint8_t* cards,int n){
  if(n!=8)return 0;
  int counts[13]={0};
  for(int i=0;i<8;i++){int m=card_month(cards[i]);if(m<1||m>12)return 0;counts[m]++;}
  for(int m=1;m<=12;m++)if(counts[m]==4)return 1;
  int pairs=0;for(int m=1;m<=12;m++){if(counts[m]==2)pairs++;else if(counts[m]!=0)return 0;}
  return pairs==4?2:0;
}

__attribute__((visibility("default"))) uint32_t matching_field_mask(int card,const uint8_t* field,int field_n){
  if(card<0||card>=48||field_n<0||field_n>16)return 0;
  const int m=card_month(card);uint32_t mask=0;
  for(int i=0;i<field_n;i++)if(card_month(field[i])==m)mask|=(1u<<i);
  return mask;
}

static int popcount32(uint32_t x){int n=0;while(x){n+=(x&1u);x>>=1;}return n;}
static uint32_t xorshift32(uint32_t x){x^=x<<13;x^=x>>17;x^=x<<5;return x?x:0x9e3779b9u;}
static int intrinsic_value(int id){const uint32_t f=card_flags(id);int v=0;if(f&LIGHT)v+=42;if(f&TANE)v+=18;if(f&RIBBON)v+=12;if(f&AKATAN)v+=12;if(f&AOTAN)v+=12;if(f&SAKE)v+=18;if(f&KASU)v+=3;return v;}
static int flag_count(const uint8_t* cards,int n,uint32_t flag){int c=0;for(int i=0;i<n;i++)if(card_flags(cards[i])&flag)c++;return c;}
static int set_progress(const uint8_t* cards,int n,int id,int a,int b,int c){if(id!=a&&id!=b&&id!=c)return 0;int have=0;if(id!=a&&contains(cards,n,a))have++;if(id!=b&&contains(cards,n,b))have++;if(id!=c&&contains(cards,n,c))have++;return have==2?58:have==1?16:4;}
static int pair_progress(const uint8_t* cards,int n,int id,int a,int b){if(id!=a&&id!=b)return 0;const int other=id==a?b:a;return contains(cards,n,other)?38:5;}
static int progress_value(const uint8_t* cards,int n,int id){
  const uint32_t f=card_flags(id);int v=0;
  if(f&LIGHT)v+=8+flag_count(cards,n,LIGHT)*10;
  if(f&TANE)v+=4+flag_count(cards,n,TANE)*4;
  if(f&RIBBON)v+=4+flag_count(cards,n,RIBBON)*4;
  if(f&KASU)v+=2+flag_count(cards,n,KASU)*2;
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
  const int before=score_captured(cards,n),after=score_captured(temp,n+add_n);return(before<0||after<0)?0:after-before;
}
static int capture_bundle_value(const uint8_t* own,int own_n,const uint8_t* opp,int opp_n,const uint8_t* additions,int add_n,int difficulty){
  int v=0;for(int i=0;i<add_n;i++)v+=intrinsic_value(additions[i]);
  if(difficulty>=1){for(int i=0;i<add_n;i++)v+=progress_value(own,own_n,additions[i]);v+=projected_score_delta(own,own_n,additions,add_n)*(difficulty>=2?22:5);}
  if(difficulty>=2){for(int i=0;i<add_n;i++)v+=progress_value(opp,opp_n,additions[i])*2;v+=projected_score_delta(opp,opp_n,additions,add_n)*9;}
  return v;
}

__attribute__((visibility("default"))) int choose_hand_index(const uint8_t* hand,int hand_n,const uint8_t* field,int field_n,const uint8_t* own_captured,int own_n,const uint8_t* opp_captured,int opp_n,int difficulty,uint32_t seed){
  if(hand_n<=0||hand_n>8||field_n<0||field_n>16||own_n<0||own_n>48||opp_n<0||opp_n>48)return -1;
  if(difficulty<=0)return (int)(xorshift32(seed)%((uint32_t)hand_n));
  int best=0,bestScore=-1000000000;
  for(int i=0;i<hand_n;i++){
    const int id=hand[i];const uint32_t mm=matching_field_mask(id,field,field_n);const int matches=popcount32(mm);int s=0;
    if(matches==0){
      s-=intrinsic_value(id)*2;
      s-=progress_value(opp_captured,opp_n,id)*(difficulty>=2?3:1);
      if(difficulty>=2){uint8_t add[1]={(uint8_t)id};s-=projected_score_delta(opp_captured,opp_n,add,1)*12;}
    }else if(matches==1){
      for(int j=0;j<field_n;j++)if(mm&(1u<<j)){uint8_t add[2]={(uint8_t)id,field[j]};s+=80+capture_bundle_value(own_captured,own_n,opp_captured,opp_n,add,2,difficulty);break;}
    }else if(matches==2){
      int localBest=-1000000000;
      for(int j=0;j<field_n;j++)if(mm&(1u<<j)){uint8_t add[2]={(uint8_t)id,field[j]};int x=capture_bundle_value(own_captured,own_n,opp_captured,opp_n,add,2,difficulty);if(x>localBest)localBest=x;}
      s+=55+localBest;
    }else if(matches==3){
      uint8_t add[4];int k=0;add[k++]=(uint8_t)id;for(int j=0;j<field_n;j++)if(mm&(1u<<j))add[k++]=field[j];s+=170+capture_bundle_value(own_captured,own_n,opp_captured,opp_n,add,k,difficulty);
    }
    if(difficulty>=2)s+=progress_value(own_captured,own_n,id)*2;
    s+=(int)(xorshift32(seed+(uint32_t)i*2654435761u)&3u);
    if(s>bestScore){bestScore=s;best=i;}
  }
  return best;
}

__attribute__((visibility("default"))) int choose_capture_index(const uint8_t* field,int field_n,const uint8_t* matches,int match_n,const uint8_t* own_captured,int own_n,const uint8_t* opp_captured,int opp_n,int difficulty,int played_card,uint32_t seed){
  if(field_n<1||field_n>16||match_n<1||match_n>3||played_card<0||played_card>=48)return -1;
  if(difficulty<=0)return matches[xorshift32(seed)%((uint32_t)match_n)];
  int best=-1,bestScore=-1000000000;
  for(int i=0;i<match_n;i++){
    const int idx=matches[i];if(idx<0||idx>=field_n)continue;
    uint8_t add[2]={(uint8_t)played_card,field[idx]};int s=capture_bundle_value(own_captured,own_n,opp_captured,opp_n,add,2,difficulty);
    s+=(int)(xorshift32(seed+(uint32_t)i*2246822519u)&1u);
    if(s>bestScore){bestScore=s;best=idx;}
  }
  return best;
}

}