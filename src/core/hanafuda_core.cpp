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

__attribute__((visibility("default"))) int core_version(){ return 2; }
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
static int intrinsic_value(int id){const uint32_t f=card_flags(id);int v=0;if(f&LIGHT)v+=15;if(f&TANE)v+=7;if(f&RIBBON)v+=5;if(f&AKATAN)v+=7;if(f&AOTAN)v+=7;if(f&SAKE)v+=8;if(f&KASU)v+=1;return v;}

__attribute__((visibility("default"))) int choose_hand_index(const uint8_t* hand,int hand_n,const uint8_t* field,int field_n,const uint8_t* own_captured,int own_n,const uint8_t* opp_captured,int opp_n,int difficulty,uint32_t seed){
  (void)own_captured;(void)own_n;(void)opp_captured;(void)opp_n;
  if(hand_n<=0||hand_n>8||field_n<0||field_n>16)return -1;
  if(difficulty<=0){return (int)(xorshift32(seed)%((uint32_t)hand_n));}
  int best=0,bestScore=-1000000;
  for(int i=0;i<hand_n;i++){
    const int id=hand[i];const uint32_t mm=matching_field_mask(id,field,field_n);const int matches=popcount32(mm);
    int s=0;
    if(matches==1){s+=20;for(int j=0;j<field_n;j++)if(mm&(1u<<j))s+=intrinsic_value(field[j]);}
    else if(matches==2)s+=12;
    else if(matches==3){s+=45;for(int j=0;j<field_n;j++)if(mm&(1u<<j))s+=intrinsic_value(field[j]);}
    else s-=intrinsic_value(id)/2;
    if(difficulty>=2){s+=intrinsic_value(id);const int m=card_month(id);int same=0;for(int j=0;j<field_n;j++)if(card_month(field[j])==m)same++;s+=same*3;}
    s+=(int)((xorshift32(seed+(uint32_t)i*2654435761u))&3u);
    if(s>bestScore){bestScore=s;best=i;}
  }
  return best;
}

}
