(()=>{
  let stagedHand=null;
  let committing=false;
  let koiDecisionPending=false;

  function inPlayerPlayPhase(){
    return typeof snapshot!=="undefined"&&snapshot&&snapshot.turn===playerSeat()&&snapshot.phase===1&&!busy&&!committing;
  }
  function sameMonth(a,b){return Math.floor(a/4)===Math.floor(b/4);}
  function candidatesFor(handIndex){
    if(!snapshot||!Number.isInteger(handIndex)||!Number.isInteger(snapshot.hand?.[handIndex]))return [];
    const card=snapshot.hand[handIndex];
    return snapshot.field.map((fieldCard,index)=>sameMonth(card,fieldCard)?index:-1).filter(index=>index>=0);
  }
  function clearStage(restore=true){
    stagedHand=null;
    document.querySelectorAll(".hand-card-button.selection-chosen,.field-card-button.selection-target").forEach(el=>el.classList.remove("selection-chosen","selection-target"));
    document.querySelector(".field-empty-target")?.remove();
    if(restore&&typeof renderMatch==="function"&&snapshot&&currentScreen()==="match")renderMatch();
  }
  function paintStage(){
    if(stagedHand===null||!snapshot)return;
    const handButtons=[...app.querySelectorAll(".hand-card-button")];
    handButtons.forEach((button,index)=>{
      button.disabled=false;
      button.classList.toggle("selection-chosen",index===stagedHand);
    });
    const candidates=candidatesFor(stagedHand);
    const fieldButtons=[...app.querySelectorAll(".field-card-button")];
    fieldButtons.forEach((button,index)=>{
      const selectable=candidates.includes(index);
      button.disabled=!selectable;
      button.classList.toggle("selection-target",selectable);
    });
    document.querySelector(".field-empty-target")?.remove();
    if(candidates.length===0){
      const grid=app.querySelector(".field-grid");
      if(grid){
        const empty=document.createElement("button");
        empty.type="button";
        empty.className="field-empty-target";
        empty.dataset.emptyField="true";
        empty.innerHTML="<span>空き場</span><strong>ここに出す</strong>";
        grid.append(empty);
      }
    }
    const status=app.querySelector(".status-message");
    if(status)status.textContent=candidates.length?"取る場札を選んでください。手札を押し直すと選び直せます。":"同じ月の札がありません。「ここに出す」を選んでください。手札は選び直せます。";
  }
  async function commit(fieldIndex){
    if(stagedHand===null||committing||!inPlayerPlayPhase())return;
    const handIndex=stagedHand;
    const candidates=candidatesFor(handIndex);
    if(fieldIndex!==null&&!candidates.includes(fieldIndex))return;
    if(fieldIndex===null&&candidates.length!==0)return;
    committing=true;
    stagedHand=null;
    try{
      await sendAction("play",{handIndex});
      if(fieldIndex!==null&&snapshot&&snapshot.turn===playerSeat()&&snapshot.phase===2){
        const pending=Array.isArray(snapshot.pendingMatches)?snapshot.pendingMatches:[];
        if(pending.includes(fieldIndex))await sendAction("capture",{fieldIndex});
      }
    }finally{
      committing=false;
      if(snapshot&&currentScreen()==="match")renderMatch();
    }
  }

  app.addEventListener("click",event=>{
    const target=event.target instanceof Element?event.target:null;
    if(!target)return;
    const hand=target.closest(".hand-card-button");
    if(hand&&inPlayerPlayPhase()){
      event.preventDefault();event.stopImmediatePropagation();
      const index=Number(hand.dataset.handIndex);
      stagedHand=stagedHand===index?null:index;
      if(stagedHand===null)clearStage(true);else paintStage();
      return;
    }
    const field=target.closest(".field-card-button");
    if(field&&stagedHand!==null){
      event.preventDefault();event.stopImmediatePropagation();
      const index=Number(field.dataset.fieldIndex);
      if(candidatesFor(stagedHand).includes(index))void commit(index);
      return;
    }
    const empty=target.closest(".field-empty-target");
    if(empty&&stagedHand!==null){
      event.preventDefault();event.stopImmediatePropagation();void commit(null);
    }
  },true);

  startCpu=async function(){
    if(busy)return;busy=true;
    try{
      settings.mode=(app.querySelector("#cpu-mode")?.value??settings.mode);
      settings.rounds=Number(app.querySelector("#rounds")?.value??settings.rounds);
      settings.koiEnabled=app.querySelector("#koi-enabled")?.checked??settings.koiEnabled;saveSettings();
      let modeSessionId,modeSessionToken;
      if(settings.mode!=="impossible"){
        const mode=await api("/api/mode/start",{mode:settings.mode,rounds:settings.rounds,developer:false});
        if(!mode.ok||!mode.data?.ok)throw new Error(mode.data?.code||"MODE_START_FAILED");
        modeSessionId=mode.data.sessionId;modeSessionToken=mode.data.token;
      }
      const started=await api("/api/cpu/start",settings.mode==="impossible"?{mode:"impossible",rounds:settings.rounds,koiEnabled:settings.koiEnabled,unlocked:isUnlocked()}:{mode:settings.mode,rounds:settings.rounds,koiEnabled:settings.koiEnabled,modeSessionId,modeSessionToken});
      if(!started.ok||!started.data?.ok)throw new Error(started.data?.code||"CPU_START_FAILED");
      session={kind:"cpu",sessionId:started.data.sessionId,token:started.data.token,version:Number(started.data.version),mode:settings.mode,rounds:settings.rounds,koiEnabled:settings.koiEnabled,modeSessionId,modeSessionToken};
      snapshot=started.data.snapshot;pendingModeTransition=started.data.modeTransition?.transition==="impossible";hiddenFirstEncounter=false;roundHistory=[];currentRound=-1;
      stack=["home","cpu-setup","match"];
      renderMatch();
      await animateNewRoundIfNeeded(true);
      await acceptApiEvents(started.data.events??[]);
      if(started.data.unlockGranted===true)grantUnlock();
      renderMatch();
    }catch(e){toast(`開始できません: ${e instanceof Error?e.message:"ERROR"}`);}finally{busy=false;if(snapshot&&currentScreen()==="match")renderMatch();}
  };

  const baseChooseKoi=chooseKoi;
  chooseKoi=async function(continueKoi){
    if(koiDecisionPending)return;
    koiDecisionPending=true;
    try{
      for(let guard=0;busy&&guard<240;guard++)await delay(25);
      if(busy){toast("前の処理が完了するまでお待ちください");return;}
      if(!snapshot||snapshot.phase!==4||snapshot.turn!==playerSeat())return;
      await baseChooseKoi(continueKoi);
    }catch(e){
      toast(`こいこい選択に失敗しました: ${e instanceof Error?e.message:"ERROR"}`);
      try{await refreshStatus();}catch{}
    }finally{
      koiDecisionPending=false;
      if(snapshot&&currentScreen()==="match")renderMatch();
    }
  };

  window.__hanafudaTurnFlowVersion="2";
})();
