(()=>{
  const runtimeWindow=window as Window & {
    renderMatch:typeof renderMatch;
    chooseKoi:typeof chooseKoi;
    goHome:typeof goHome;
    requestIdleCallback?:(callback:()=>void,options?:{timeout:number})=>number;
    __hanafudaFinalResultFixVersion?:string;
  };
  const baseRenderMatch=renderMatch;
  const SUPABASE_ASSET_ROOT="https://mpuhgfbdkxmhynytwhzu.supabase.co/storage/v1/object/public/hanafuda-assets/impossible-clear/";
  const FINAL_BG_URL="https://mpuhgfbdkxmhynytwhzu.supabase.co/storage/v1/object/public/hanafuda-effects/settlement-bg.png";
  const IMPOSSIBLE_CLEAR_BG_URL=SUPABASE_ASSET_ROOT+"rainbow-clear-bg.png";
  const IMPOSSIBLE_CLEAR_TITLE_URL=SUPABASE_ASSET_ROOT+"congratulation.png";
  const IMPOSSIBLE_CLEAR_THANKS_URL=SUPABASE_ASSET_ROOT+"thank-you-for-praying.png";
  let koiChoiceCommitted=false;
  let finalBgWarmScheduled=false;
  let finalBgWarmImage:HTMLImageElement|null=null;
  let impossibleClearWarmScheduled=false;
  const impossibleClearWarmImages:HTMLImageElement[]=[];

  function removeTransientMatchOverlays(){
    app.querySelectorAll(".modal-layer,.settlement-layer,.dramatic-callout-layer,.supabase-effect-layer,.fx-layer").forEach(el=>el.remove());
  }

  function scheduleIdle(callback:()=>void){
    if(typeof runtimeWindow.requestIdleCallback==="function")runtimeWindow.requestIdleCallback(callback,{timeout:5000});
    else window.setTimeout(callback,1200);
  }

  function warmFinalBackgroundWhenIdle(){
    if(finalBgWarmScheduled)return;
    finalBgWarmScheduled=true;
    scheduleIdle(()=>{
      const img=new Image();
      finalBgWarmImage=img;
      img.decoding="async";
      img.src=FINAL_BG_URL;
      if(typeof img.decode==="function")void img.decode().catch(()=>{});
    });
  }

  function warmImpossibleClearAssetsWhenIdle(){
    if(impossibleClearWarmScheduled)return;
    impossibleClearWarmScheduled=true;
    scheduleIdle(()=>{
      for(const src of [IMPOSSIBLE_CLEAR_BG_URL,IMPOSSIBLE_CLEAR_TITLE_URL,IMPOSSIBLE_CLEAR_THANKS_URL]){
        const img=new Image();
        impossibleClearWarmImages.push(img);
        img.decoding="async";
        img.src=src;
        if(typeof img.decode==="function")void img.decode().catch(()=>{});
      }
    });
  }

  function isImpossibleSpecialVictory(s:Snapshot){
    return hiddenFirstEncounter===true&&session?.kind==="cpu"&&session.mode==="impossible"&&s.totalRounds===6&&s.matchWinner===playerSeat();
  }

  function finalResultTitle(s:Snapshot){
    const winner=s.matchWinner;
    if(winner===2||winner===255)return "対局終了";
    return winner===playerSeat()?"勝利":"敗北";
  }

  function renderImpossibleClear(){
    if(!snapshot||!session)return baseRenderMatch();
    removeTransientMatchOverlays();
    app.classList.remove("final-result-mode");
    app.classList.add("impossible-clear-mode");
    app.innerHTML=`<main class="impossible-clear-screen" style="--impossible-clear-bg:url('${IMPOSSIBLE_CLEAR_BG_URL}')"><div class="impossible-clear-copy" aria-label="Congratulation. Thank You for Praying！"><img class="impossible-clear-title" src="${IMPOSSIBLE_CLEAR_TITLE_URL}" alt="Congratulation"><img class="impossible-clear-thanks" src="${IMPOSSIBLE_CLEAR_THANKS_URL}" alt="Thank You for Praying！"></div></main>`;
  }

  function renderDedicatedFinalResult(){
    if(!snapshot||!session)return baseRenderMatch();
    removeTransientMatchOverlays();
    app.classList.remove("impossible-clear-mode");
    app.classList.add("final-result-mode");
    const s=snapshot;
    const [myScore,oppScore]=perspectiveScores(s);
    const winner=s.matchWinner;
    const draw=winner===2||winner===255;
    const playerWin=winner===playerSeat();
    const summary=draw?"最終結果は引き分けです。":playerWin?"あなたの勝ちです。":"相手の勝ちです。";
    const actions=session.kind==="online"
      ?'<button class="primary" data-postmatch="reconfigure">再戦する</button><button class="secondary" data-postmatch="same">同じ条件でもう一度</button><button class="secondary" data-postmatch="home">ホームに戻る</button>'
      :'<button class="primary" data-action="cpu-reconfigure">再戦する</button><button class="secondary" data-action="cpu-same">同じ条件でもう一度</button><button class="secondary" data-action="finish-home">ホームに戻る</button>';
    app.innerHTML=`<main class="final-result-screen"><div class="final-result-content"><div class="final-result-kicker">全局終了</div><h1>${finalResultTitle(s)}</h1><div class="final-result-score"><strong>${myScore}</strong><span>−</span><strong>${oppScore}</strong></div><p>${summary}</p><div class="screen-actions">${actions}</div></div></main>`;
    bindMatchActions();
  }

  runtimeWindow.renderMatch=function(){
    if(snapshot?.phase===6){
      if(isImpossibleSpecialVictory(snapshot))return renderImpossibleClear();
      return renderDedicatedFinalResult();
    }
    app.classList.remove("final-result-mode","impossible-clear-mode");
    const out=baseRenderMatch();
    if(snapshot&&matchInteractionReady)warmFinalBackgroundWhenIdle();
    if(hiddenFirstEncounter)warmImpossibleClearAssetsWhenIdle();
    if(koiChoiceCommitted){
      app.querySelectorAll(".modal-layer").forEach(layer=>{if(layer.querySelector(".koi-choice"))layer.remove();});
    }
    return out;
  };

  runtimeWindow.chooseKoi=async function(continueKoi:boolean){
    if(koiChoiceCommitted||busy)return;
    if(!snapshot||snapshot.phase!==4||snapshot.turn!==playerSeat())return;
    koiChoiceCommitted=true;
    app.querySelectorAll(".modal-layer").forEach(layer=>{if(layer.querySelector(".koi-choice"))layer.remove();});
    try{
      if(continueKoi&&!settings.skipNormalAnimations)await showCallout("effect.koikoi.text");
      emitAudioHook(continueKoi?"koikoi":"agari");
      await sendAction("koi",{chooseKoi:continueKoi});
    }catch(e){
      try{await refreshStatus();}catch{}
      if(snapshot&&currentScreen()==="match")renderMatch();
      throw e;
    }finally{
      koiChoiceCommitted=false;
      if(snapshot&&currentScreen()==="match")renderMatch();
    }
  };

  const baseGoHome=goHome;
  runtimeWindow.goHome=function(){app.classList.remove("final-result-mode","impossible-clear-mode");return baseGoHome();};

  runtimeWindow.__hanafudaFinalResultFixVersion="5";
  void finalBgWarmImage;
  void impossibleClearWarmImages;
})();
