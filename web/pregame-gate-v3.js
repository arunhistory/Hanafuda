"use strict";

function dealerLabelV3(v){return v===0?"あなた":v===1?"相手":"ランダム";}

function renderCpuPreparationScreenV3(){
  app.innerHTML=`<main class="${screenClass("match-screen pre-match-preparing")}"><header class="match-hud"><div class="scorebox"><span>CPU / ${escapeHtml(modeLabel(settings.mode))}</span><span class="score">0</span></div><div class="round-info">対局準備<br>親: ${escapeHtml(dealerLabelV3(settings.firstDealer))}</div><div class="scorebox right"><span class="score">0</span><span>あなた</span></div></header><section class="board"><div class="opponent-zone"><div class="hand-row"></div><div class="captured-box"><div class="captured-title">相手の取得札</div><div class="captured-row"></div></div></div><div class="field-wrap"><div class="field-grid"></div></div><div class="player-zone"><div class="captured-box"><div class="captured-title">あなたの取得札</div><div class="captured-row"></div></div><div class="hand-row"></div></div></section><div class="status-strip"><span class="status-message">対局準備中</span><span class="status-actions"></span></div></main>`;
}

async function dealPreparedSnapshotV3(){
  const board=app.querySelector(".board");
  board?.classList.add("dealing");
  await delay(Math.min(1200,700+(snapshot?.hand.length??8)*55));
  board?.classList.remove("dealing");
  emitAudioHook("deal");
}

async function releaseCpuAfterReadyV3(){
  if(!session||session.kind!=="cpu")return;
  const ready=await api("/api/cpu/ready",{sessionId:session.sessionId,token:session.token});
  if(!ready.ok||!ready.data?.ok)throw new Error(ready.data?.code||"CPU_READY_FAILED");
  session.version=Number(ready.data.version);
  pendingModeTransition=ready.data.modeTransition?.transition==="impossible";
  await acceptApiEvents(ready.data.events??[]);
  snapshot=ready.data.snapshot;
  if(ready.data.unlockGranted===true)grantUnlock();
}

async function startCpuSequencedV3(){
  if(busy)return;
  busy=true;
  let modeSessionId,modeSessionToken;
  let authoritativeGameCreated=false;
  try{
    saveSettings();
    const firstDealer=settings.firstDealer;

    matchInteractionReady=false;
    session=null;
    snapshot=null;
    pendingModeTransition=false;
    hiddenFirstEncounter=false;
    roundHistory=[];
    currentRound=-1;
    stack=["home","cpu-setup","match"];
    renderCpuPreparationScreenV3();

    // No mode authority, game engine, or CPU execution exists during shuffle.
    await showShuffle(true);

    // Start authority only when the actual game is about to be created.
    if(settings.mode!=="impossible"){
      const mode=await api("/api/mode/start",{mode:settings.mode,rounds:settings.rounds,developer:false});
      if(!mode.ok||!mode.data?.ok)throw new Error(mode.data?.code||"MODE_START_FAILED");
      modeSessionId=mode.data.sessionId;
      modeSessionToken=mode.data.token;
    }

    const started=await api("/api/cpu/start",settings.mode==="impossible"
      ?{mode:"impossible",rounds:settings.rounds,koiEnabled:settings.koiEnabled,firstDealer,unlocked:isUnlocked()}
      :{mode:settings.mode,rounds:settings.rounds,koiEnabled:settings.koiEnabled,firstDealer,modeSessionId,modeSessionToken});
    if(!started.ok||!started.data?.ok)throw new Error(started.data?.code||"CPU_START_FAILED");

    session={kind:"cpu",sessionId:started.data.sessionId,token:started.data.token,version:Number(started.data.version),mode:settings.mode,rounds:settings.rounds,koiEnabled:settings.koiEnabled,firstDealer,modeSessionId,modeSessionToken};
    snapshot=started.data.snapshot;
    authoritativeGameCreated=true;
    pendingModeTransition=started.data.modeTransition?.transition==="impossible";
    hiddenFirstEncounter=false;
    roundHistory=[];
    currentRound=snapshot.roundIndex;

    // Keep the lightweight preparation board visible while dealing. The real card DOM is created only after the deal finishes.
    await dealPreparedSnapshotV3();
    renderMatch();
    await showReadyGate();

    // Release server-side CPU only after shuffle, deal and ready presentation are complete.
    await releaseCpuAfterReadyV3();
    matchInteractionReady=true;
    busy=false;
    renderMatch();
  }catch(e){
    matchInteractionReady=false;
    if(!authoritativeGameCreated){
      session=null;
      snapshot=null;
      stack=["home","cpu-setup"];
      await render();
    }else{
      renderMatch();
    }
    toast(`開始できません: ${e instanceof Error?e.message:"ERROR"}`);
  }finally{
    busy=false;
    if(session&&snapshot)renderMatch();
  }
}

// Capture phase: prevent every legacy start handler from firing.
document.addEventListener("click",event=>{
  const target=event.target instanceof Element?event.target.closest("[data-action='start-cpu']"):null;
  if(!target)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  void startCpuSequencedV3();
},true);
