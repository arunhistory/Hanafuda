(()=>{
  const runtimeWindow=window as Window & {
    startCpu:typeof startCpu;
    sendAction:typeof sendAction;
    showCallout:typeof showCallout;
    chooseKoi:typeof chooseKoi;
    __hanafudaTurnFlowVersion?:string;
  };
  let stagedHand:number|null=null;
  let committing=false;
  let koiDecisionPending=false;
  let roundTransitionPending=false;

  function inPlayerPlayPhase(){
    return !!snapshot&&snapshot.turn===playerSeat()&&snapshot.phase===1&&!busy&&!committing;
  }
  function sameMonth(a:number,b:number){return Math.floor(a/4)===Math.floor(b/4);}
  function candidatesFor(handIndex:number){
    if(!snapshot||!Number.isInteger(handIndex)||!Number.isInteger(snapshot.hand?.[handIndex]))return [];
    const card=snapshot.hand[handIndex];
    return snapshot.field.map((fieldCard,index)=>sameMonth(card,fieldCard)?index:-1).filter(index=>index>=0);
  }
  function clearStage(restore=true){
    stagedHand=null;
    document.querySelectorAll(".hand-card-button.selection-chosen,.field-card-button.selection-target").forEach(el=>el.classList.remove("selection-chosen","selection-target"));
    document.querySelector(".field-empty-target")?.remove();
    if(restore&&snapshot&&currentScreen()==="match")renderMatch();
  }
  function paintStage(){
    if(stagedHand===null||!snapshot)return;
    const handButtons=[...app.querySelectorAll<HTMLButtonElement>(".hand-card-button")];
    handButtons.forEach((button,index)=>{
      button.disabled=false;
      button.classList.toggle("selection-chosen",index===stagedHand);
    });
    const candidates=candidatesFor(stagedHand);
    const fieldButtons=[...app.querySelectorAll<HTMLButtonElement>(".field-card-button")];
    fieldButtons.forEach((button,index)=>{
      const selectable=candidates.includes(index);
      button.disabled=!selectable;
      button.classList.toggle("selection-target",selectable);
    });
    document.querySelector(".field-empty-target")?.remove();
    if(candidates.length===0){
      const grid=app.querySelector<HTMLElement>(".field-grid");
      if(grid){
        const empty=document.createElement("button");
        empty.type="button";
        empty.className="field-empty-target";
        empty.dataset.emptyField="true";
        empty.innerHTML="<span>空き場</span><strong>ここに出す</strong>";
        grid.append(empty);
      }
    }
    const status=app.querySelector<HTMLElement>(".status-message");
    if(status)status.textContent=candidates.length?"取る場札を選んでください。手札を押し直すと選び直せます。":"同じ月の札がありません。「ここに出す」を選んでください。手札は選び直せます。";
  }
  async function commit(fieldIndex:number|null){
    if(stagedHand===null||committing||!inPlayerPlayPhase())return;
    const handIndex=stagedHand;
    const candidates=candidatesFor(handIndex);
    if(fieldIndex!==null&&!candidates.includes(fieldIndex))return;
    if(fieldIndex===null&&candidates.length!==0)return;
    committing=true;
    stagedHand=null;
    try{
      await runtimeWindow.sendAction("play",{handIndex});
      if(fieldIndex!==null&&snapshot&&snapshot.turn===playerSeat()&&snapshot.phase===2){
        const pending=Array.isArray(snapshot.pendingMatches)?snapshot.pendingMatches:[];
        if(pending.includes(fieldIndex))await runtimeWindow.sendAction("capture",{fieldIndex});
      }
    }finally{
      committing=false;
      if(snapshot&&currentScreen()==="match")renderMatch();
    }
  }

  app.addEventListener("click",event=>{
    const target=event.target instanceof Element?event.target:null;
    if(!target)return;
    const hand=target.closest<HTMLButtonElement>(".hand-card-button");
    if(hand&&inPlayerPlayPhase()){
      event.preventDefault();event.stopImmediatePropagation();
      const index=Number(hand.dataset.handIndex);
      stagedHand=stagedHand===index?null:index;
      if(stagedHand===null)clearStage(true);else paintStage();
      return;
    }
    const field=target.closest<HTMLButtonElement>(".field-card-button");
    if(field&&stagedHand!==null){
      event.preventDefault();event.stopImmediatePropagation();
      const index=Number(field.dataset.fieldIndex);
      if(candidatesFor(stagedHand).includes(index))void commit(index);
      return;
    }
    const empty=target.closest<HTMLButtonElement>(".field-empty-target");
    if(empty&&stagedHand!==null){
      event.preventDefault();event.stopImmediatePropagation();void commit(null);
    }
  },true);

  runtimeWindow.startCpu=async function(){
    if(busy)return;busy=true;
    try{
      settings.mode=(app.querySelector<HTMLSelectElement>("#cpu-mode")?.value??settings.mode) as CpuMode;
      settings.rounds=Number(app.querySelector<HTMLSelectElement>("#rounds")?.value??settings.rounds);
      settings.koiEnabled=app.querySelector<HTMLInputElement>("#koi-enabled")?.checked??settings.koiEnabled;saveSettings();
      emitAudioHook("match-start",{mode:settings.mode});
      let modeSessionId:string|undefined,modeSessionToken:string|undefined;
      if(settings.mode!=="impossible"){
        const mode=await api("/api/mode/start",{mode:settings.mode,rounds:settings.rounds,developer:false});
        if(!mode.ok||!mode.data?.ok)throw new Error(mode.data?.code||"MODE_START_FAILED");
        modeSessionId=String(mode.data.sessionId);modeSessionToken=String(mode.data.token);
      }
      const started=await api("/api/cpu/start",settings.mode==="impossible"?{mode:"impossible",rounds:settings.rounds,koiEnabled:settings.koiEnabled,unlocked:isUnlocked()}:{mode:settings.mode,rounds:settings.rounds,koiEnabled:settings.koiEnabled,modeSessionId,modeSessionToken});
      if(!started.ok||!started.data?.ok)throw new Error(started.data?.code||"CPU_START_FAILED");
      session={kind:"cpu",sessionId:String(started.data.sessionId),token:String(started.data.token),version:Number(started.data.version),mode:settings.mode,rounds:settings.rounds,koiEnabled:settings.koiEnabled,modeSessionId,modeSessionToken};
      snapshot=started.data.snapshot as Snapshot;pendingModeTransition=started.data.modeTransition?.transition==="impossible";hiddenFirstEncounter=false;roundHistory=[];currentRound=-1;
      stack=["home","cpu-setup","match"];
      renderMatch();
      await animateNewRoundIfNeeded(true);
      await acceptApiEvents((started.data.events??[]) as ApiEvent[]);
      if(started.data.unlockGranted===true)grantUnlock();
      renderMatch();
    }catch(e){emitAudioHook("match-stop");toast(`開始できません: ${e instanceof Error?e.message:"ERROR"}`);}finally{busy=false;if(snapshot&&currentScreen()==="match")renderMatch();}
  };

  async function revealRoundDealSequentially(){
    const screen=app.querySelector<HTMLElement>(".match-screen");
    const board=app.querySelector<HTMLElement>(".board");
    if(!screen||!board)return;
    screen.classList.add("round-deal-staging");
    const opponent=[...board.querySelectorAll<HTMLElement>(".opponent-zone .card-back")];
    const player=[...board.querySelectorAll<HTMLElement>(".player-zone .hand-card-button .card")];
    const field=[...board.querySelectorAll<HTMLElement>(".field-card-button .card")];
    const sequence:HTMLElement[]=[];
    const max=Math.max(opponent.length,player.length,field.length);
    for(let i=0;i<max;i++){
      if(opponent[i])sequence.push(opponent[i]);
      if(player[i])sequence.push(player[i]);
      if(field[i])sequence.push(field[i]);
    }
    for(const card of sequence){
      card.classList.add("deal-visible");
      await delay(88);
    }
    await delay(220);
    screen.classList.remove("round-deal-staging");
  }

  function clearRoundSettlementOverlay(){
    app.querySelector(".settlement-layer")?.remove();
    app.querySelector(".settlement-card")?.remove();
    const status=app.querySelector<HTMLElement>(".status-message");
    if(status)status.textContent="次局準備中";
  }

  const baseSendAction=sendAction;
  runtimeWindow.sendAction=async function(action:string,payload:Record<string,unknown>={}){
    if(action!=="next_round"||session?.kind!=="cpu")return baseSendAction(action,payload);
    if(busy||roundTransitionPending||!session||!snapshot)return;
    roundTransitionPending=true;
    const readyBefore=matchInteractionReady;
    matchInteractionReady=false;
    busy=true;
    try{
      clearRoundSettlementOverlay();
      if(!settings.skipNormalAnimations)await showShuffle(false);

      const result=await api("/api/cpu/action",{sessionId:session.sessionId,token:session.token,version:session.version,action,...payload});
      if(!result.ok||!result.data?.ok)throw new Error(result.data?.code||"ACTION_FAILED");
      session.version=Number(result.data.version);
      pendingModeTransition=result.data.modeTransition?.transition==="impossible";
      if(result.data.unlockGranted===true)grantUnlock();
      const nextSnapshot=result.data.snapshot as Snapshot|undefined;
      if(!nextSnapshot)throw new Error("NEXT_ROUND_SNAPSHOT_MISSING");

      snapshot=nextSnapshot;
      roundHistory=[];
      currentRound=nextSnapshot.roundIndex;
      renderMatch();
      if(!settings.skipNormalAnimations)await revealRoundDealSequentially();
      emitAudioHook("deal");
      await showReadyGate();
      matchInteractionReady=true;
      renderMatch();
      await releaseCpuAfterReady();
    }catch(e){
      matchInteractionReady=readyBefore;
      toast(e instanceof Error?e.message:"次局の開始に失敗しました");
      try{await refreshStatus();}catch{}
    }finally{
      busy=false;
      roundTransitionPending=false;
      if(snapshot&&currentScreen()==="match")renderMatch();
    }
  };

  runtimeWindow.showCallout=async function(assetId:string){
    const isAgari=assetId==="effect.agari.text";
    const label=isAgari?"あがり":"こいこい";
    const layer=document.createElement("div");
    layer.className=`fx-layer dramatic-callout-layer ${isAgari?"agari-dramatic":"koi-dramatic"}`;
    layer.innerHTML=`<div class="dramatic-rays" aria-hidden="true"></div><div class="dramatic-flash" aria-hidden="true"></div><div class="dramatic-callout"><strong class="dramatic-callout-text">${label}</strong><img class="dramatic-callout-art" src="${assets.path(assetId)}" alt="${label}"></div>`;
    const art=layer.querySelector<HTMLImageElement>(".dramatic-callout-art");
    const markLoaded=()=>layer.querySelector(".dramatic-callout")?.classList.add("art-loaded");
    art?.addEventListener("load",markLoaded,{once:true});
    if(art?.complete&&art.naturalWidth>0)markLoaded();
    matchEffectHost().append(layer);
    await delay(isAgari?1750:1600);
    layer.remove();
  };

  const baseChooseKoi=chooseKoi;
  runtimeWindow.chooseKoi=async function(continueKoi:boolean){
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

  runtimeWindow.__hanafudaTurnFlowVersion="2";
})();
