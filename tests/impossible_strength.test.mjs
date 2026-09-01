import fs from 'node:fs';

const bytes=fs.readFileSync(new URL('../assets/wasm/hanafuda_engine.wasm',import.meta.url));
const {instance}=await WebAssembly.instantiate(bytes,{});
const e=instance.exports;

if(typeof e.game_hidden_step!=='function')throw new Error('game_hidden_step export missing');
if(e.game_hidden_version()<1)throw new Error('invalid hidden planner version');

const MATCHES=20;
const ROUNDS=6;
const PASS_SCORE=500;
let wins=0;
let minScore=Number.POSITIVE_INFINITY;
let maxScore=0;
let sumScore=0;
let minMargin=Number.POSITIVE_INFINITY;
let maxNodes=0;
const failures=[];

for(let seed=1;seed<=MATCHES;seed++){
  const hiddenSeat=seed&1;
  const firstDealer=(seed>>>1)&1;
  if(e.game_new(seed*7919+17,ROUNDS,firstDealer,1)!==0)throw new Error(`new failed seed=${seed}`);
  let steps=0;
  const rounds=[];
  while(e.game_phase()!==6){
    if(++steps>1600)throw new Error(`loop seed=${seed} phase=${e.game_phase()}`);
    if(e.game_phase()===5){
      rounds.push({round:e.game_round_index(),winner:e.game_last_round_winner(),points:e.game_last_round_points(),hiddenTotal:e.game_score(hiddenSeat),proTotal:e.game_score(1-hiddenSeat)});
      if(e.game_next_round()!==0)throw new Error(`next round failed seed=${seed}`);
      continue;
    }
    const actor=e.game_turn();
    const rc=actor===hiddenSeat
      ? e.game_hidden_step(actor)
      : e.game_cpu_step(actor,2,(seed*0x9e3779b1+steps*0x85ebca6b)>>>0);
    if(rc!==0)throw new Error(`step failed seed=${seed} actor=${actor} phase=${e.game_phase()} rc=${rc}`);
    if(actor===hiddenSeat&&typeof e.game_hidden_last_nodes==='function')maxNodes=Math.max(maxNodes,e.game_hidden_last_nodes());
  }
  const hiddenScore=e.game_score(hiddenSeat);
  const proScore=e.game_score(1-hiddenSeat);
  const margin=hiddenScore-proScore;
  const won=e.game_match_winner()===hiddenSeat;
  if(won)wins++;
  minScore=Math.min(minScore,hiddenScore);
  maxScore=Math.max(maxScore,hiddenScore);
  sumScore+=hiddenScore;
  minMargin=Math.min(minMargin,margin);
  if(!won||hiddenScore<PASS_SCORE)failures.push({seed,hiddenSeat,hiddenScore,proScore,winner:e.game_match_winner(),rounds});
}

const avg=(sumScore/MATCHES).toFixed(1);
console.log(`IMPOSSIBLE_BENCH matches=${MATCHES} wins=${wins}/${MATCHES} min=${minScore} avg=${avg} max=${maxScore} minMargin=${minMargin} maxNodes=${maxNodes}`);
if(failures.length){
  console.error('IMPOSSIBLE_FAILURES',JSON.stringify(failures.slice(0,20)));
  process.exit(1);
}
console.log(`PASS impossible CPU wins 100% and scores at least ${PASS_SCORE} in every ${ROUNDS}-round match`);
