(()=>{
  const baseRenderMatch=renderMatch;
  let koiChoiceCommitted=false;

  function removeTransientMatchOverlays(){
    app.querySelectorAll(".modal-layer,.settlement-layer,.agari-yaku-layer,.dramatic-callout-layer,.supabase-effect-layer,.fx-layer").forEach(el=>el.remove());
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
    app.innerHTML=`<main class="final-result-screen"><section class="final-result-panel"><div class="final-result-kicker">全局終了</div><h1>${finalResultTitle(s)}</h1><div class="final-result-score"><strong>${myScore}</strong><span>−</span><strong>${oppScore}</strong></div><p>${summary}</p><div class="screen-actions">${actions}</div></section></main>`;
    bindMatchActions();
  }

  renderMatch=function(){
    if(snapshot?.phase===6)return renderDedicatedFinalResult();
    app.classList.remove("final-result-mode");
    const out=baseRenderMatch();
    if(koiChoiceCommitted){
      app.querySelector(".modal-layer .koi-choice")?.closest(".modal-layer")?.remove();
    }
    return out;
  };

  chooseKoi=async function(continueKoi){
    if(koiChoiceCommitted||busy)return;
    if(!snapshot||snapshot.phase!==4||snapshot.turn!==playerSeat())return;
    koiChoiceCommitted=true;
    app.querySelector(".modal-layer .koi-choice")?.closest(".modal-layer")?.remove();
    try{
      // The decision UI always comes first. Only after the player commits do we show the chosen outcome animation.
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

  window.__hanafudaFinalResultFixVersion="2";
})();
