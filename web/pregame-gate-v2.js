"use strict";

function renderCpuPreparationScreen(){
  app.innerHTML=`<main class="${screenClass("match-screen pre-match-preparing")}"><header class="match-hud"><div class="scorebox"><span>CPU / ${escapeHtml(modeLabel(settings.mode))}</span><span class="score">0</span></div><div class="round-info">対局準備</div><div class="scorebox right"><span class="score">0</span><span>あなた</span></div></header><section class="board"><div class="opponent-zone"><div class="hand-row"></div><div class="captured-box"><div class="captured-title">相手の取得札</div><div class="captured-row"></div></div></div><div class="field-wrap"><div class="field-grid"></div></div><div class="player-zone"><div class="captured-box"><div class="captured-title">あなたの取得札</div><div class="captured-row"></div></div><div class="hand-row"></div></div></section><div class="status-strip"><span class="status-message">対局準備中</span><span class="status-actions"></span></div></main>`;
}

async function dealPreparedSnapshot(){
  const board=app.querySelector(".board");
  board?.classList.add("dealing");
  await delay(Math.min(1200,700+(snapshot?.hand.length??8)*55));
  board?.classList.remove("dealing");
  emitAudioHook("deal");
}

startCpu=async function(){
  if(busy)return;
  busy=true;
  let modeSessionId,modeSessionToken;
  try{
    settings.mode=(app.querySelector("#cpu-mode")?.value??settings.mode);
    settings.rounds=Number(app.querySelector("#rounds")?.value??settings.rounds);
    settings.koiEnabled=app.querySelector("#koi-enabled")?.checked??settings.koiEnabled;
    saveSettings();

    if(settings.mode!=="impossible"){
      const mode=await api("/api/mode/start",{mode:settings.mode,rounds:settings.rounds,developer:false});
      if(!mode.ok||!mode.data?.ok)throw new Error(mode.data?.code||"MODE_START_FAILED");
      modeSessionId=mode.data.sessionId;
      modeSessionToken=mode.data.token;
    }

    matchInteractionReady=false;
    session=null;
    snapshot=null;
    pendingModeTransition=false;
    hiddenFirstEncounter=false;
    roundHistory=[];
    currentRound=-1;
    stack=["home","cpu-setup","match"];
    renderCpuPreparationScreen();

    // The game engine must not exist while the shuffle presentation is running.
    await showShuffle(true);

    // Only after shuffle completion is the authoritative game created/dealt.
    const started=await api("/api/cpu/start",settings.mode==="impossible"
      ?{mode:"impossible",rounds:settings.rounds,koiEnabled:settings.koiEnabled,unlocked:isUnlocked()}
      :{mode:settings.mode,rounds:settings.rounds,koiEnabled:settings.koiEnabled,modeSessionId,modeSessionToken});
    if(!started.ok||!started.data?.ok)throw new Error(started.data?.code||"CPU_START_FAILED");

    session={kind:"cpu",sessionId:started.data.sessionId,token:started.data.token,version:Number(started.data.version),mode:settings.mode,rounds:settings.rounds,koiEnabled:settings.koiEnabled,modeSessionId,modeSessionToken};
    snapshot=started.data.snapshot;
    pendingModeTransition=started.data.modeTransition?.transition==="impossible";
    hiddenFirstEncounter=false;
    roundHistory=[];
    currentRound=snapshot.roundIndex;

    // Still preparation-only: phase/turn from the snapshot cannot open player input yet.
    renderMatch();
    await dealPreparedSnapshot();
    await showReadyGate();

    // This is the real match start boundary.
    matchInteractionReady=true;
    renderMatch();
    await releaseCpuAfterReady();
  }catch(e){
    matchInteractionReady=true;
    session=null;
    snapshot=null;
    stack=["home","cpu-setup"];
    await render();
    toast(`開始できません: ${e instanceof Error?e.message:"ERROR"}`);
  }finally{
    busy=false;
    if(session&&snapshot)renderMatch();
  }
};
