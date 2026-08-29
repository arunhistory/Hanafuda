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
