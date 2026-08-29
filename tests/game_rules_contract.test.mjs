import fs from 'node:fs';

const bytes=fs.readFileSync(new URL('../assets/wasm/hanafuda_engine.wasm',import.meta.url));
const {instance}=await WebAssembly.instantiate(bytes,{});
const e=instance.exports;
const mem=new Uint8Array(e.memory.buffer);
const view=new DataView(e.memory.buffer);
const S=e.game_state_ptr();

const O={
  totalRounds:6,roundIndex:7,dealer:8,turn:9,phase:10,status:11,totalScore:12,scoreStamp:20,stampCounter:28,
  hand:36,handN:52,field:54,fieldN:70,deck:71,deckPos:119,captured:120,capturedN:216,yakuMask:218,
  yakuScore:226,offeredScore:230,koiUsed:232,koiCaller:233,pendingCard:234,pendingActor:235,
  pendingMatches:236,pendingMatchN:239,pendingSource:240,lastRoundWinner:241,lastRoundPoints:242,
  special:244,matchWinner:246,koiEnabled:248
};
const PHASE={play:1,handCapture:2,drawCapture:3,koi:4,settlement:5,complete:6};
const OK=0,ERR_CHOICE=-4;
const tests=[];
function check(name,condition,detail=''){tests.push({name,ok:!!condition,detail});}
function u8(off,v){mem[S+off]=v;}
function i16(off,v){view.setInt16(S+off,v,true);}
function i32(off,v){view.setInt32(S+off,v,true);}
function u32(off,v){view.setUint32(S+off,v,true);}
function readCards(getN,getCard,p){return Array.from({length:getN(p)},(_,i)=>getCard(p,i));}
function baseState({dealer=0,turn=0,koiEnabled=1,totalRounds=2,roundIndex=0}={}){
  if(e.game_new(12345,totalRounds,dealer,koiEnabled)!==OK)throw new Error('game_new failed');
  u8(O.roundIndex,roundIndex);u8(O.dealer,dealer);u8(O.turn,turn);u8(O.phase,PHASE.play);u8(O.status,0);
  i32(O.totalScore,0);i32(O.totalScore+4,0);u32(O.scoreStamp,0);u32(O.scoreStamp+4,0);u32(O.stampCounter,0);
  mem.fill(255,S+O.hand,S+O.hand+16);u8(O.handN,0);u8(O.handN+1,0);
  mem.fill(255,S+O.field,S+O.field+16);u8(O.fieldN,0);
  mem.fill(255,S+O.captured,S+O.captured+96);u8(O.capturedN,0);u8(O.capturedN+1,0);
  u32(O.yakuMask,0);u32(O.yakuMask+4,0);i16(O.yakuScore,0);i16(O.yakuScore+2,0);i16(O.offeredScore,0);
  u8(O.koiUsed,0);u8(O.koiCaller,255);u8(O.pendingCard,255);u8(O.pendingActor,255);u8(O.pendingMatchN,0);u8(O.pendingSource,0);
  u8(O.lastRoundWinner,255);i16(O.lastRoundPoints,0);u8(O.special,0);u8(O.special+1,0);u8(O.matchWinner,255);u8(O.koiEnabled,koiEnabled);
  u8(O.deckPos,48);
}
function setHand(p,cards){mem.fill(255,S+O.hand+p*8,S+O.hand+p*8+8);cards.forEach((c,i)=>u8(O.hand+p*8+i,c));u8(O.handN+p,cards.length);}
function setField(cards){mem.fill(255,S+O.field,S+O.field+16);cards.forEach((c,i)=>u8(O.field+i,c));u8(O.fieldN,cards.length);}
function captured(p){return readCards(e.game_captured_n,e.game_captured_card,p);}
function field(){return Array.from({length:e.game_field_n()},(_,i)=>e.game_field_card(i));}

// 0 same-month: played card must remain on field; there is no intentional-discard branch when a capture exists.
baseState();setHand(0,[0]);setHand(1,[8]);setField([4]);
check('zero match places played card on field',e.game_play_hand(0,0)===OK&&field().includes(0)&&e.game_captured_n(0)===0);

// 1 same-month: mandatory immediate capture.
baseState();setHand(0,[0]);setHand(1,[8]);setField([1,4]);
check('one match captures mandatory pair',e.game_play_hand(0,0)===OK&&captured(0).includes(0)&&captured(0).includes(1)&&!field().includes(1));

// 2 same-month: engine must stop for an explicit choice, and only one matching field card may be selected.
baseState();setHand(0,[0]);setHand(1,[8]);setField([1,2,4]);
const twoRc=e.game_play_hand(0,0),pending=Array.from({length:e.game_pending_match_n()},(_,i)=>e.game_pending_match_index(i));
check('two matches require player choice',twoRc===OK&&e.game_phase()===PHASE.handCapture&&pending.length===2);
check('two-match invalid field choice rejected',e.game_choose_capture(0,2)===ERR_CHOICE);
const chosen=pending[1];
check('two-match valid choice captures only selected match',e.game_choose_capture(0,chosen)===OK&&captured(0).length===2&&field().some(c=>Math.floor(c/4)===0));

// 3 same-month: played fourth card captures all four automatically.
baseState();setHand(0,[0]);setHand(1,[8]);setField([1,2,3,4]);
check('three matches capture all four automatically',e.game_play_hand(0,0)===OK&&captured(0).filter(c=>Math.floor(c/4)===0).length===4&&field().every(c=>Math.floor(c/4)!==0));

// Koi is at most once per round.
baseState();setHand(0,[0,4,8]);setHand(1,[12,16,20]);u8(O.phase,PHASE.koi);i16(O.offeredScore,30);
check('first koi is allowed',e.game_koi_decision(0,1)===OK&&e.game_koi_used()===1);
u8(O.turn,1);u8(O.phase,PHASE.koi);i16(O.offeredScore,30);
check('second koi in same round is rejected',e.game_koi_decision(1,1)===ERR_CHOICE);

// Both players under three cards: no Koi choice.
baseState();setHand(0,[0,4]);setHand(1,[8,12]);u8(O.phase,PHASE.koi);i16(O.offeredScore,30);
check('koi unavailable when both hands are below three',e.game_koi_decision(0,1)===ERR_CHOICE);

// Koi disabled by RuleSet.
baseState({koiEnabled:0});setHand(0,[0,4,8]);setHand(1,[12,16,20]);u8(O.phase,PHASE.koi);i16(O.offeredScore,30);
check('disabled koi cannot be chosen',e.game_koi_decision(0,1)===ERR_CHOICE);

// After a Koi, settlement multiplier is exactly x2.
baseState();setHand(0,[0,4,8]);setHand(1,[12,16,20]);u8(O.phase,PHASE.koi);u8(O.koiUsed,1);i16(O.offeredScore,30);
check('post-koi settlement is exactly double',e.game_koi_decision(0,0)===OK&&e.game_last_round_points()===60&&e.game_score(0)===60);

// Normal winner becomes next dealer immediately at settlement.
baseState({dealer:0,turn:1});setHand(0,[0,4,8]);setHand(1,[12,16,20]);u8(O.phase,PHASE.koi);i16(O.offeredScore,30);
check('round winner becomes dealer',e.game_koi_decision(1,0)===OK&&e.game_dealer()===1&&e.game_last_round_winner()===1);

// Draw leaves dealer unchanged.
baseState({dealer:1,turn:0});setHand(0,[0]);setHand(1,[]);setField([4]);
check('draw keeps dealer',e.game_play_hand(0,0)===OK&&e.game_last_round_winner()===2&&e.game_last_round_points()===0&&e.game_dealer()===1);

// Final cumulative tie: earlier arrival at the final tied score wins.
baseState({totalRounds:1,roundIndex:0});u8(O.phase,PHASE.settlement);u8(O.status,1);i32(O.totalScore,100);i32(O.totalScore+4,100);u32(O.scoreStamp,4);u32(O.scoreStamp+4,7);u32(O.stampCounter,7);
check('final tie uses first arrival stamp',e.game_next_round()===OK&&e.game_phase()===PHASE.complete&&e.game_match_winner()===0);

// Exact simultaneous/no-arrival tie remains unresolved by spec and must stay sentinel 255.
baseState({totalRounds:1,roundIndex:0});u8(O.phase,PHASE.settlement);u8(O.status,1);i32(O.totalScore,0);i32(O.totalScore+4,0);u32(O.scoreStamp,0);u32(O.scoreStamp+4,0);
check('unresolved all-zero tie remains sentinel',e.game_next_round()===OK&&e.game_match_winner()===255);

for(const t of tests)console.log(t.ok?'PASS':'FAIL',t.name,t.detail);
if(tests.some(t=>!t.ok))process.exit(1);
