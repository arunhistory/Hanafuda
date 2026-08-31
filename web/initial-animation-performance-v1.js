(()=>{
  const baseShowShuffle=showShuffle;

  showShuffle=async function(initial=false){
    if(!initial)return baseShowShuffle(false);
    const layer=document.createElement("div");
    layer.className="fx-layer shuffle-layer long-shuffle initial-shuffle-lite";
    layer.innerHTML='<div class="shuffle-deck"><i class="shuffle-card" style="--sx:1;--sr:1"></i><i class="shuffle-card" style="--sx:-1;--sr:-1"></i></div>';
    matchEffectHost().append(layer);
    emitAudioHook("shuffle");
    await delay(1080);
    layer.remove();
  };

  dealPreparedSnapshotV3=async function(){
    const board=app.querySelector(".board");
    if(!board){emitAudioHook("deal");return;}
    const back=assets.path("cards.back");
    const cards=()=>`<img src="${back}" alt="" aria-hidden="true"><img src="${back}" alt="" aria-hidden="true"><img src="${back}" alt="" aria-hidden="true">`;
    const stage=document.createElement("div");
    stage.className="initial-deal-stage";
    stage.innerHTML=`<div class="initial-deal-flight to-opponent">${cards()}</div><div class="initial-deal-flight to-field">${cards()}</div><div class="initial-deal-flight to-player">${cards()}</div>`;
    board.append(stage);
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    stage.classList.add("run");
    await delay(620);
    stage.remove();
    emitAudioHook("deal");
  };

  window.__hanafudaInitialAnimationPerformanceVersion="2";
})();
