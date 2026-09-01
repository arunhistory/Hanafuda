import fs from 'node:fs';

const bytes=fs.readFileSync(new URL('../assets/wasm/hanafuda_engine.wasm',import.meta.url));
const {instance}=await WebAssembly.instantiate(bytes,{});
const e=instance.exports;
const stateSize=e.game_state_size();
const statePtr=e.game_state_ptr();
const ioPtr=e.game_io_buffer();
const SEEDS=Array.from({length:20},(_,i)=>i+1);
const ROUNDS=6;
const NODE_CAP=1_500_000;

function save(){return new Uint8Array(e.memory.buffer,statePtr,stateSize).slice();}
function load(state){new Uint8Array(e.memory.buffer,ioPtr,stateSize).set(state);if(e.game_load(ioPtr,stateSize)!==0)throw new Error('restore failed');}
function key(state,steps){return `${steps}:`+Buffer.from(state).toString('base64');}
function proSeed(seed,step){return (Math.imul(seed,0x9e3779b1)+Math.imul(step,0x85ebca6b))>>>0;}

function solveRound(hiddenSeat,seed,startSteps,roundBaseHidden,roundBasePro){
  const root=save();
  const memo=new Map();
  let nodes=0;
  const terminal=()=>{
    const hg=e.game_score(hiddenSeat)-roundBaseHidden,pg=e.game_score(1-hiddenSeat)-roundBasePro;
    return {u:hg*1000-pg*100,hg,pg};
  };
  const rec=(steps)=>{
    if(++nodes>NODE_CAP)throw new Error(`oracle node cap seed=${seed} round=${e.game_round_index()}`);
    if(e.game_phase()===5||e.game_phase()===6)return terminal();
    const before=save(),k=key(before,steps),cached=memo.get(k);
    if(cached)return cached;
    const actor=e.game_turn();
    let best=null;
    if(actor===hiddenSeat){
      const phase=e.game_phase(),candidates=[];
      if(phase===1){for(let i=0;i<e.game_hand_n(actor);i++)candidates.push(['play',i]);}
      else if(phase===2||phase===3){for(let i=0;i<e.game_pending_match_n();i++)candidates.push(['capture',e.game_pending_match_index(i)]);}
      else if(phase===4)candidates.push(['koi',0],['koi',1]);
      else throw new Error(`hidden bad phase ${phase}`);
      for(const [type,arg] of candidates){
        load(before);
        const rc=type==='play'?e.game_play_hand(actor,arg):type==='capture'?e.game_choose_capture(actor,arg):e.game_koi_decision(actor,arg);
        if(rc!==0)continue;
        const result=rec(steps+1);
        if(!best||result.u>best.u)best=result;
      }
      load(before);
      if(!best)throw new Error('no legal hidden action');
    }else{
      const rc=e.game_cpu_step(actor,2,proSeed(seed,steps+1));
      if(rc!==0)throw new Error(`pro step failed rc=${rc}`);
      best=rec(steps+1);
      load(before);
    }
    memo.set(k,best);
    return best;
  };
  const answer=rec(startSteps);
  load(root);
  return {...answer,nodes};
}

function chooseOracleAction(hiddenSeat,seed,steps,roundBaseHidden,roundBasePro){
  const before=save(),phase=e.game_phase(),actor=e.game_turn();
  if(actor!==hiddenSeat)throw new Error('oracle called on Pro turn');
  const candidates=[];
  if(phase===1){for(let i=0;i<e.game_hand_n(actor);i++)candidates.push(['play',i]);}
  else if(phase===2||phase===3){for(let i=0;i<e.game_pending_match_n();i++)candidates.push(['capture',e.game_pending_match_index(i)]);}
  else if(phase===4)candidates.push(['koi',0],['koi',1]);
  else throw new Error(`oracle action bad phase ${phase}`);
  let best=null,bestAction=null,totalNodes=0;
  for(const action of candidates){
    load(before);
    const [type,arg]=action;
    const rc=type==='play'?e.game_play_hand(actor,arg):type==='capture'?e.game_choose_capture(actor,arg):e.game_koi_decision(actor,arg);
    if(rc!==0)continue;
    const result=solveRound(hiddenSeat,seed,steps+1,roundBaseHidden,roundBasePro);
    totalNodes+=result.nodes;
    if(!best||result.u>best.u){best=result;bestAction=action;}
  }
  load(before);
  if(!bestAction)throw new Error('oracle found no action');
  return {action:bestAction,predicted:best,nodes:totalNodes};
}

const scores=[];
let oracleWins=0;
for(const seed of SEEDS){
  const hiddenSeat=seed&1,firstDealer=(seed>>>1)&1;
  if(e.game_new(seed*7919+17,ROUNDS,firstDealer,1)!==0)throw new Error(`new failed ${seed}`);
  let steps=0,maxNodes=0;
  let roundBaseHidden=e.game_score(hiddenSeat),roundBasePro=e.game_score(1-hiddenSeat);
  const rounds=[];
  while(e.game_phase()!==6){
    if(++steps>2000)throw new Error(`loop seed=${seed}`);
    if(e.game_phase()===5){
      rounds.push({round:e.game_round_index(),winner:e.game_last_round_winner(),points:e.game_last_round_points(),hidden:e.game_score(hiddenSeat),pro:e.game_score(1-hiddenSeat)});
      if(e.game_next_round()!==0)throw new Error('next round failed');
      roundBaseHidden=e.game_score(hiddenSeat);roundBasePro=e.game_score(1-hiddenSeat);
      continue;
    }
    const actor=e.game_turn();
    if(actor===hiddenSeat){
      const {action,nodes}=chooseOracleAction(hiddenSeat,seed,steps-1,roundBaseHidden,roundBasePro);maxNodes=Math.max(maxNodes,nodes);
      const [type,arg]=action;
      const rc=type==='play'?e.game_play_hand(actor,arg):type==='capture'?e.game_choose_capture(actor,arg):e.game_koi_decision(actor,arg);
      if(rc!==0)throw new Error(`oracle apply failed ${rc}`);
    }else{
      const rc=e.game_cpu_step(actor,2,proSeed(seed,steps));
      if(rc!==0)throw new Error(`pro apply failed ${rc}`);
    }
  }
  const hiddenScore=e.game_score(hiddenSeat),proScore=e.game_score(1-hiddenSeat),winner=e.game_match_winner();
  scores.push(hiddenScore);if(winner===hiddenSeat)oracleWins++;
  console.log('ORACLE_MATCH',JSON.stringify({seed,hiddenSeat,hiddenScore,proScore,winner,maxNodes,rounds}));
}
const min=Math.min(...scores),max=Math.max(...scores),avg=scores.reduce((a,b)=>a+b,0)/scores.length;
console.log(`ORACLE_SUMMARY matches=${scores.length} wins=${oracleWins}/${scores.length} min=${min} avg=${avg.toFixed(1)} max=${max} atLeast500=${scores.filter(x=>x>=500).length}/${scores.length} atLeast800=${scores.filter(x=>x>=800).length}/${scores.length} atLeast1200=${scores.filter(x=>x>=1200).length}/${scores.length}`);
console.log('PASS oracle ceiling diagnostic completed');
