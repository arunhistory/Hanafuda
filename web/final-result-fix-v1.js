(()=>{
  const baseRenderMatch=renderMatch;
  const baseChooseKoi=chooseKoi;

  function finalResultTitle(s){
    const winner=s.matchWinner;
    if(winner===2||winner===255)return "対局終了";
    return winner===playerSeat()?"勝利":"敗北";
  }

  function purgeTransientMatchOverlays(){
    app.querySelectorAll(".modal-layer,.settlement-layer,.settlement-card,.agari-yaku-layer,.agari-yaku-card,.supabase-effect-layer,.dramatic-callout-layer").forEach(el=>el.remove());
  }

  function renderDedicatedFinalResult(){
    if(!snapshot||!session)return baseRenderMatch();
    purgeTransientMatchOverlays();
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
    app.innerHTML=`<main class="screen final-result-screen"><section class="final-result-panel"><div class="final-result-kicker">全局終了</div><h1>${finalResultTitle(s)}</h1><div class="final-result-score"><strong>${myScore}</strong><span>−</span><strong>${oppScore}</strong></div><p>${summary}</p><div class="screen-actions">${actions}</div></section></main>`;
    bindMatchActions();
  }

  renderMatch=function(){
    if(snapshot?.phase===6)return renderDedicatedFinalResult();
    app.classList.remove("final-result-mode");
    purgeTransientMatchOverlays();
    return baseRenderMatch();
  };

  chooseKoi=async function(continueKoi){
    app.querySelectorAll(".modal-layer").forEach(layer=>{
      if(layer.querySelector(".koi-choice"))layer.remove();
    });
    try{
      await baseChooseKoi(continueKoi);
      purgeTransientMatchOverlays();
    }catch(e){
      if(snapshot&&currentScreen()==="match")renderMatch();
      throw e;
    }
  };

  window.__hanafudaPurgeTransientMatchOverlays=purgeTransientMatchOverlays;
  window.__hanafudaFinalResultFixVersion="2";
})();
