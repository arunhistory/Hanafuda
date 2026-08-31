(()=>{
  const baseRenderMatch=renderMatch;
  const FINAL_BG_URL="https://mpuhgfbdkxmhynytwhzu.supabase.co/storage/v1/object/public/hanafuda-effects/settlement-bg.png";
  let koiChoiceCommitted=false;
  let finalBgWarmScheduled=false;
  let finalBgWarmImage=null;

  function removeTransientMatchOverlays(){
    app.querySelectorAll(".modal-layer,.settlement-layer,.agari-yaku-layer,.dramatic-callout-layer,.supabase-effect-layer,.fx-layer").forEach(el=>el.remove());
  }

  function warmFinalBackgroundWhenIdle(){
    if(finalBgWarmScheduled)return;
    finalBgWarmScheduled=true;
    const warm=()=>{
      const img=new Image();
      finalBgWarmImage=img;
      img.decoding="async";
      img.src=FINAL_BG_URL;
      if(typeof img.decode==="function")void img.decode().catch(()=>{});
    };
    if("requestIdleCallback" in window){
      window.requestIdleCallback(warm,{timeout:5000});
    }else{
      window.setTimeout(warm,1200);
    }
  }

  function finalResultTitle(s){
    const winner=s.matchWinner;
    if(winner===2||winner===255)return "対局終了";
    return winner===playerSeat()?"勝利":"敗北";
  }

  function renderDedicatedFinalResult(){
    if(!snapshot||!session)return baseRenderMatch();
    removeTransientMatchOverlays();
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

  renderMatch=function(){
    if(snapshot?.phase===6)return renderDedicatedFinalResult();
    app.classList.remove("final-result-mode");
    const out=baseRenderMatch();
    if(snapshot&&matchInteractionReady)warmFinalBackgroundWhenIdle();
    if(koiChoiceCommitted){
      app.querySelectorAll(".modal-layer").forEach(layer=>{if(layer.querySelector(".koi-choice"))layer.remove();});
    }
    return out;
  };

  chooseKoi=async function(continueKoi){
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
  goHome=function(){app.classList.remove("final-result-mode");return baseGoHome();};

  window.__hanafudaFinalResultFixVersion="4";
})();
