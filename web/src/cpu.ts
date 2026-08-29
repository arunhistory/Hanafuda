async function api(path:string,body:unknown,extra:RequestInit={}){
  const response=await fetch(`${API_BASE}${path}`,{method:"POST",headers:{"content-type":"application/json",...(extra.headers||{})},body:JSON.stringify(body),cache:"no-store",...extra});
  const data=await response.json().catch(()=>null);
  return {ok:response.ok,status:response.status,data};
}

async function startCpu(){
  if(busy)return;busy=true;
  try{
    settings.mode=(app.querySelector<HTMLSelectElement>("#cpu-mode")?.value??settings.mode) as CpuMode;
    settings.rounds=Number(app.querySelector<HTMLSelectElement>("#rounds")?.value??settings.rounds);
    settings.koiEnabled=app.querySelector<HTMLInputElement>("#koi-enabled")?.checked??settings.koiEnabled;saveSettings();
    let modeSessionId:string|undefined,modeSessionToken:string|undefined;
    if(settings.mode!=="impossible"){
      const mode=await api("/api/mode/start",{mode:settings.mode,rounds:settings.rounds,developer:false,unlocked:isUnlocked()});
      if(!mode.ok||!mode.data?.ok)throw new Error(mode.data?.code||"MODE_START_FAILED");
      modeSessionId=mode.data.sessionId;modeSessionToken=mode.data.token;
    }
    const started=await api("/api/cpu/start",settings.mode==="impossible"?{mode:"impossible",rounds:settings.rounds,koiEnabled:settings.koiEnabled,unlocked:isUnlocked()}:{mode:settings.mode,rounds:settings.rounds,koiEnabled:settings.koiEnabled,modeSessionId,modeSessionToken});
    if(!started.ok||!started.data?.ok)throw new Error(started.data?.code||"CPU_START_FAILED");
    session={kind:"cpu",sessionId:started.data.sessionId,token:started.data.token,version:Number(started.data.version),mode:settings.mode,rounds:settings.rounds,koiEnabled:settings.koiEnabled,modeSessionId,modeSessionToken};
    snapshot=started.data.snapshot;pendingModeTransition=started.data.modeTransition?.transition==="impossible";hiddenFirstEncounter=false;roundHistory=[];currentRound=-1;
    stack=["home","cpu-setup","match"];
    await acceptApiEvents(started.data.events??[]);if(started.data.unlockGranted===true)grantUnlock();
    renderMatch();await animateNewRoundIfNeeded(true);
  }catch(e){toast(`開始できません: ${e instanceof Error?e.message:"ERROR"}`);}finally{busy=false;}
}

async function acceptApiEvents(events:ApiEvent[]){for(const event of events){if(event?.snapshot)await acceptSnapshot(event.snapshot,event.actionEvent??null,event.actor);if(session?.kind==="cpu")session.version=Number(event.version);}}
async function acceptSnapshot(next:Snapshot,event:ActionEvent|null,actor?:string){
  const old=snapshot;snapshot=next;
  if(event)recordHistory(event,actor);
  if(old&&old.roundIndex!==next.roundIndex){roundHistory=[];currentRound=-1;}
  if(event&&!settings.skipNormalAnimations)await animateEvent(event);
}
function recordHistory(event:ActionEvent,actor?:string){
  const who=event.actor===playerSeat()||actor==="player"?"あなた":event.actor===opponentSeat()||actor==="cpu"?"相手":"システム";
  const bits:string[]=[];
  if(event.type==="play"||event.type==="cpu_step"){if(Number.isInteger(event.playedCard))bits.push(`${cardName(event.playedCard!)}を出した`);if(Number.isInteger(event.drawnCard))bits.push(`山札から${cardName(event.drawnCard!)}を引いた`);}
  if(event.type==="capture")bits.push("取得する場札を選択した");
  if(event.capturedCards?.length)bits.push(`${event.capturedCards.map(cardName).join("・")}を取得`);
  if(event.newYakuMask)bits.push(`役成立: ${yakuNames(event.newYakuMask)}`);
  if(event.type==="koi")bits.push(event.chooseKoi?"こいこい":"あがり");
  if(event.settlement)bits.push(event.settlement.winner===2?"流局":`局終了 ${event.settlement.points}点`);
  if(bits.length)roundHistory.push(`${who}: ${bits.join(" / ")}`);
}
function cardName(card:number){return `${Math.floor(card/4)+1}月${card%4+1}番札`;}

async function sendAction(action:string,payload:Record<string,unknown>={}){
  if(busy||!session||!snapshot)return;busy=true;
  try{
    if(session.kind==="cpu"){
      const result=await api("/api/cpu/action",{sessionId:session.sessionId,token:session.token,version:session.version,action,...payload});
      if(!result.ok||!result.data?.ok)throw new Error(result.data?.code||"ACTION_FAILED");
      session.version=Number(result.data.version);pendingModeTransition=result.data.modeTransition?.transition==="impossible";
      await acceptApiEvents(result.data.events??[]);snapshot=result.data.snapshot;if(result.data.unlockGranted===true)grantUnlock();
    }else{
      const result=await api("/api/online/action",{roomCode:session.roomCode,token:session.token,epoch:session.epoch,version:session.version,action,...payload});
      if(!result.ok||!result.data?.ok)throw new Error(result.data?.code||"ACTION_FAILED");
      const responseVersion=Number(result.data.version),alreadyApplied=Number.isSafeInteger(responseVersion)&&session.version>=responseVersion;
      if(!alreadyApplied){
        if(Number.isSafeInteger(responseVersion))session.version=responseVersion;
        snapshot=result.data.snapshot;
        const event=result.data.actionEvent as ActionEvent|null;
        if(event){recordHistory(event,"player");if(!settings.skipNormalAnimations)await animateEvent(event);}
      }
    }
    renderMatch();await animateNewRoundIfNeeded(false);
  }catch(e){toast(e instanceof Error?e.message:"操作に失敗しました");await refreshStatus();}finally{busy=false;renderMatch();}
}
async function chooseKoi(continueKoi:boolean){
  if(continueKoi&&!settings.skipNormalAnimations){await showCallout("effect.koikoi.text");}
  emitAudioHook(continueKoi?"koikoi":"agari");
  await sendAction("koi",{chooseKoi:continueKoi});
}
async function nextRound(){await sendAction("next_round");}

async function refreshStatus(){
  if(!session)return;
  try{
    if(session.kind==="cpu"){
      const r=await api("/api/cpu/status",{sessionId:session.sessionId,token:session.token});if(r.ok&&r.data?.ok){session.version=Number(r.data.version);snapshot=r.data.snapshot;pendingModeTransition=r.data.pendingTransition===true;if(r.data.unlockGranted===true)grantUnlock();}
    }else{
      const r=await api("/api/online/status",{roomCode:session.roomCode,token:session.token});if(r.ok&&r.data?.ok){session.version=Number(r.data.version);session.epoch=String(r.data.epoch??session.epoch);snapshot=r.data.snapshot;}
    }
  }catch{}
}

async function beginImpossibleTransition(){
  if(!session||session.kind!=="cpu"||busy)return;busy=true;
  try{
    await showCollapse({unskippable:true});
    const r=await api("/api/cpu/transition",{sessionId:session.sessionId,token:session.token,version:session.version});
    if(!r.ok||!r.data?.ok)throw new Error(r.data?.code||"TRANSITION_FAILED");
    session.version=Number(r.data.version);session.mode="impossible";session.rounds=6;hiddenFirstEncounter=true;pendingModeTransition=false;snapshot=r.data.snapshot;roundHistory=[];currentRound=-1;
    await acceptApiEvents(r.data.events??[]);renderMatch();await animateNewRoundIfNeeded(true);
  }catch(e){toast(e instanceof Error?e.message:"遷移に失敗しました");await refreshStatus();}finally{busy=false;renderMatch();}
}

async function closeMatch(homeAfter:boolean){
  const closing=session;session=null;snapshot=null;modal=null;pendingModeTransition=false;hiddenFirstEncounter=false;onlineReconfigureState="none";roundHistory=[];app.classList.remove("corrupted-round-shift");
  try{
    if(closing?.kind==="cpu")await api("/api/cpu/close",{sessionId:closing.sessionId,token:closing.token});
    if(closing?.kind==="online"){closing.socket?.close();await api("/api/online/close",{roomCode:closing.roomCode,token:closing.token,reason:"client_leave"});}
  }catch{}
  if(homeAfter)goHome();else render();
}
async function cpuPostmatch(choice:"reconfigure"|"same"){
  const prior=session?.kind==="cpu"?{mode:session.mode,rounds:session.rounds,koiEnabled:session.koiEnabled}:null;await closeMatch(false);if(!prior)return goHome();settings={...settings,...prior};saveSettings();if(choice==="reconfigure"){stack=["home","cpu-setup"];render();}else{stack=["home","cpu-setup"];render();await startCpu();}
}