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
      const mode=await api("/api/mode/start",{mode:settings.mode,rounds:settings.rounds,developer:false});
      if(!mode.ok||!mode.data?.ok)throw new Error(mode.data?.code||"MODE_START_FAILED");
      modeSessionId=mode.data.sessionId;modeSessionToken=mode.data.token;
    }
    const started=await api("/api/cpu/start",settings.mode==="impossible"?{mode:"impossible",rounds:settings.rounds,koiEnabled:settings.koiEnabled,unlocked:isUnlocked()}:{mode:settings.mode,rounds:settings.rounds,koiEnabled:settings.koiEnabled,modeSessionId,modeSessionToken});
    if(!started.ok||!started.data?.ok)throw new Error(started.data?.code||"CPU_START_FAILED");
    session={kind:"cpu",sessionId:started.data.sessionId,token:started.data.token,version:Number(started.data.version),mode:settings.mode,rounds:settings.rounds,koiEnabled:settings.koiEnabled,modeSessionId,modeSessionToken};
    const startEvents=(started.data.events??[]) as ApiEvent[];
    const stagedStart=startEvents.find(event=>event?.snapshot)?.snapshot??started.data.snapshot;
    snapshot=stagedStart;pendingModeTransition=started.data.modeTransition?.transition==="impossible";hiddenFirstEncounter=false;roundHistory=[];currentRound=-1;
    stack=["home","cpu-setup","match"];
    renderMatch();
    await animateNewRoundIfNeeded(true);
    await acceptApiEvents(startEvents);
    snapshot=started.data.snapshot;
    if(started.data.unlockGranted===true)grantUnlock();
    renderMatch();
  }catch(e){toast(`開始できません: ${e instanceof Error?e.message:"ERROR"}`);}finally{busy=false;renderMatch();}
}

async function acceptApiEvents(events:ApiEvent[]){for(const event of events){if(event?.snapshot)await acceptSnapshot(event.snapshot,event.actionEvent??null,event.actor);if(session?.kind==="cpu")session.version=Number(event.version);}}
function newlyCaptured(before:number[],after:number[]){
  const counts=new Map<number,number>();
  for(const card of before)counts.set(card,(counts.get(card)??0)+1);
  const added:number[]=[];
  for(const card of after){const left=counts.get(card)??0;if(left>0)counts.set(card,left-1);else added.push(card);}
  return added;
}
function presentationEvent(old:Snapshot|null,next:Snapshot,event:ActionEvent,actor?:string):ActionEvent{
  const actorSeat=Number.isInteger(event.actor)?Number(event.actor):actor==="cpu"?opponentSeat():actor==="player"?playerSeat():null;
  const captured=event.capturedCards?.length?event.capturedCards:(old&&actorSeat!==null?newlyCaptured(old.captured[actorSeat]??[],next.captured[actorSeat]??[]):[]);
  return {...event,actor:actorSeat===null?event.actor:actorSeat,capturedCards:captured};
}
async function acceptSnapshot(next:Snapshot,event:ActionEvent|null,actor?:string){
  const old=snapshot;
  const visibleEvent=event?presentationEvent(old,next,event,actor):null;
  snapshot=next;
  renderMatch();
  if(visibleEvent)recordHistory(visibleEvent,actor);
  if(old&&old.roundIndex!==next.roundIndex){roundHistory=[];currentRound=-1;}
  if(visibleEvent&&!settings.skipNormalAnimations)await animateEvent(visibleEvent);
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
        const next=result.data.snapshot as Snapshot;
        const rawEvent=result.data.actionEvent as ActionEvent|null;
        const visibleEvent=rawEvent?presentationEvent(snapshot,next,rawEvent,"player"):null;
        snapshot=next;
        renderMatch();
        if(visibleEvent){recordHistory(visibleEvent,"player");if(!settings.skipNormalAnimations)await animateEvent(visibleEvent);}
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
    await showCollapse();
    const result=await api("/api/cpu/transition",{sessionId:session.sessionId,token:session.token});
    if(!result.ok||!result.data?.ok)throw new Error(result.data?.code||"TRANSITION_FAILED");
    session.version=Number(result.data.version);session.mode="impossible";session.rounds=Number(result.data.rounds);snapshot=result.data.snapshot;pendingModeTransition=false;hiddenFirstEncounter=true;roundHistory=[];currentRound=-1;
    renderMatch();await animateNewRoundIfNeeded(true);await acceptApiEvents(result.data.events??[]);
  }catch(e){toast(`遷移に失敗しました: ${e instanceof Error?e.message:"ERROR"}`);}finally{busy=false;renderMatch();}
}

async function animateNewRoundIfNeeded(force:boolean){
  if(!snapshot)return;const changed=force||currentRound!==snapshot.roundIndex;if(!changed)return;currentRound=snapshot.roundIndex;roundHistory=[];
  if(settings.skipNormalAnimations)return;
  const corruptedShift=session?.kind==="cpu"&&session.mode==="impossible";
  if(corruptedShift)app.classList.add("corrupted-round-shift");
  try{
    await showShuffle(force);
    const board=app.querySelector(".board");board?.classList.add("dealing");await delay(Math.min(1200,700+snapshot.hand.length*55));board?.classList.remove("dealing");emitAudioHook("deal");
  }finally{
    if(corruptedShift)app.classList.remove("corrupted-round-shift");
  }
}
function confirmedSettlementYaku(event:ActionEvent){
  const winner=Number(event.settlement?.winner);
  if(!snapshot||(winner!==0&&winner!==1))return "";
  const special=specialName(snapshot.special[winner]);
  if(special)return special;
  const mask=event.yakuMasks?.[winner]??snapshot.yakuMasks[winner];
  return yakuNames(mask);
}
function matchEffectHost(){return document.documentElement.classList.contains("mobile-webapp")?app:document.body;}
async function animateEvent(event:ActionEvent){
  await playVisibleActionSteps(event);
  if(event.capturedCards?.length)await showCaptureTrail(event.capturedCards,event.actor===playerSeat());
  if(event.settlement&&event.settlement.winner!==2){
    await showCallout("effect.agari.text");
    const label=confirmedSettlementYaku(event);if(label&&label!=="なし")await showAgariYaku(label);
  }
  emitAudioHook("card-action",{event});await delay(350);
}
async function showShuffle(initial=false){
  const layer=document.createElement("div");layer.className=`fx-layer shuffle-layer${initial?" long-shuffle":""}`;layer.innerHTML='<div class="shuffle-deck"><i class="shuffle-card" style="--sx:1;--sr:1"></i><i class="shuffle-card" style="--sx:-1;--sr:-1"></i><i class="shuffle-card" style="--sx:1;--sr:-1"></i><i class="shuffle-card" style="--sx:-1;--sr:1"></i></div>';document.body.append(layer);emitAudioHook("shuffle");await delay(initial?2250:1250);layer.remove();
}
async function showCallout(assetId:string){
  const layer=document.createElement("div");layer.className="fx-layer";const particles=Array.from({length:22},(_,i)=>`<i class="particle" style="left:${10+(i*37)%80}%;top:${15+(i*53)%70}%;--dx:${((i%7)-3)*31}px;--dy:${((i%5)-2)*34}px"></i>`).join("");layer.innerHTML=`<div class="callout">${particles}<img src="${assets.path(assetId)}" alt=""></div>`;matchEffectHost().append(layer);await delay(1850);layer.remove();
}
async function showAgariYaku(label:string){
  const layer=document.createElement("div");layer.className="fx-layer agari-yaku-layer";layer.innerHTML=`<div class="agari-yaku-card"><span>成立役</span><strong>${escapeHtml(label)}</strong></div>`;matchEffectHost().append(layer);await delay(1250);layer.remove();
}
async function showCaptureTrail(cards:number[],toPlayer:boolean){
  const layer=document.createElement("div");layer.className=`capture-trail ${toPlayer?"to-player":"to-opponent"}`;
  layer.innerHTML=cards.slice(0,4).map((card,i)=>`<span style="--trail-index:${i}">${cardImg(card)}</span>`).join("");
  document.body.append(layer);await delay(900);layer.remove();
}
async function showCollapse(){
  const layer=document.createElement("div");layer.className="fx-layer collapse-layer";layer.innerHTML='<div class="collapse-stage"></div><div class="collapse-text">▧▒░ERROR░▒▧</div>';document.body.append(layer);emitAudioHook("impossible-collapse");await delay(3200);layer.remove();
}
function delay(ms:number){return new Promise<void>(resolve=>setTimeout(resolve,ms));}

async function closeMatch(homeAfter=false){
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
