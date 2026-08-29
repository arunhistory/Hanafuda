import fs from 'node:fs';

const bytes=fs.readFileSync(new URL('../assets/wasm/hanafuda_engine.wasm',import.meta.url));
const {instance}=await WebAssembly.instantiate(bytes,{});
const e=instance.exports;

function invariant(){
  const seen=new Set();
  for(let p=0;p<2;p++)for(let i=0;i<e.game_hand_n(p);i++){const c=e.game_hand_card(p,i);if(seen.has(c))throw new Error('duplicate hand card');seen.add(c);}
  for(let i=0;i<e.game_field_n();i++){const c=e.game_field_card(i);if(seen.has(c))throw new Error('duplicate field card');seen.add(c);}
  for(let p=0;p<2;p++)for(let i=0;i<e.game_captured_n(p);i++){const c=e.game_captured_card(p,i);if(seen.has(c))throw new Error('duplicate captured card');seen.add(c);}
  if(e.game_score(0)<0||e.game_score(1)<0)throw new Error('negative score');
  if(![0,1].includes(e.game_koi_enabled()))throw new Error('invalid koi setting');
  const remain=e.game_deck_remaining();
  if(remain<0||remain>24)throw new Error('invalid deck remaining');
  if(remain>0&&e.game_deck_card_relative(0)<0)throw new Error('server deck inspection ABI invalid');
}

function xr(value){let x=value>>>0;x^=(x<<13)>>>0;x^=x>>>17;x^=(x<<5)>>>0;return (x>>>0)||0x9e3779b9;}
function shuffled(seed){let state=(seed>>>0)||0x9e3779b9;const deck=Array.from({length:48},(_,i)=>i);for(let i=47;i>0;i--){state=xr(state);const j=state%(i+1);[deck[i],deck[j]]=[deck[j],deck[i]];}return deck;}
function month(card){return Math.floor(card/4)+1;}
function special(hand){const counts=Array(13).fill(0);for(const card of hand)counts[month(card)]++;if(counts.some(n=>n===4))return true;let pairs=0;for(let m=1;m<=12;m++){if(counts[m]===2)pairs++;else if(counts[m]!==0)return false;}return pairs===4;}
function firstDeal(seed){const deck=shuffled(seed),field=[],child=[],dealer=[];let p=0;for(let group=0;group<4;group++){field.push(deck[p++],deck[p++]);child.push(deck[p++],deck[p++]);dealer.push(deck[p++],deck[p++]);}return {deck,field,child,dealer};}
function hasFieldFour(field){const counts=Array(13).fill(0);for(const card of field)if(++counts[month(card)]>=4)return true;return false;}

let dealOrderVerified=false;
for(let seed=1;seed<=500&&!dealOrderVerified;seed++){
  const expected=firstDeal(seed);if(hasFieldFour(expected.field)||special(expected.child)||special(expected.dealer))continue;
  if(e.game_new(seed,1,0,1)!==0)throw new Error('deal-order game_new failed');
  if(e.game_phase()!==1)continue;
  const actualField=Array.from({length:e.game_field_n()},(_,i)=>e.game_field_card(i));
  const actualDealer=Array.from({length:e.game_hand_n(0)},(_,i)=>e.game_hand_card(0,i));
  const actualChild=Array.from({length:e.game_hand_n(1)},(_,i)=>e.game_hand_card(1,i));
  if(JSON.stringify(actualField)!==JSON.stringify(expected.field))throw new Error(`field deal order mismatch seed=${seed}`);
  if(JSON.stringify(actualChild)!==JSON.stringify(expected.child))throw new Error(`child deal order mismatch seed=${seed}`);
  if(JSON.stringify(actualDealer)!==JSON.stringify(expected.dealer))throw new Error(`dealer deal order mismatch seed=${seed}`);
  if(e.game_deck_remaining()!==24||e.game_deck_card_relative(0)!==expected.deck[24])throw new Error(`deck boundary mismatch seed=${seed}`);
  dealOrderVerified=true;
}
if(!dealOrderVerified)throw new Error('no deterministic deal-order test seed found');
console.log('PASS standard 2-field/2-child/2-dealer recipient order with one-card state sequence');

for(const koiEnabled of [0,1]){
  for(let seed=1;seed<=200;seed++){
    if(e.game_new(seed,12,-1,koiEnabled)!==0)throw new Error(`new failed ${seed}`);
    if(e.game_koi_enabled()!==koiEnabled)throw new Error('koi setting not persisted');
    let steps=0;
    while(e.game_phase()!==6){
      if(++steps>2000)throw new Error(`loop seed=${seed} phase=${e.game_phase()}`);
      invariant();
      if(e.game_phase()===5){if(e.game_next_round()!==0)throw new Error('next round failed');continue;}
      const turn=e.game_turn();
      const rc=e.game_cpu_step(turn,2,seed*10000+steps);
      if(rc!==0)throw new Error(`cpu step failed seed=${seed} phase=${e.game_phase()} rc=${rc}`);
      if(!koiEnabled&&e.game_phase()===4)throw new Error('koi decision offered while disabled');
    }
    invariant();
    if(![0,1,255].includes(e.game_match_winner()))throw new Error('invalid winner');
  }
}
console.log('PASS 400 complete simulated matches with Koi enabled/disabled');
