(()=>{
  const baseShowShuffle=showShuffle;

  showShuffle=async function(initial=false){
    if(!initial)return baseShowShuffle(false);
    const layer=document.createElement("div");
    layer.className="fx-layer shuffle-layer long-shuffle initial-shuffle-lite";
    layer.innerHTML='<div class="shuffle-deck"><i class="shuffle-card" style="--sx:1;--sr:1"></i><i class="shuffle-card" style="--sx:-1;--sr:-1"></i></div>';
    matchEffectHost().append(layer);
    emitAudioHook("shuffle");
    await delay(1280);
    layer.remove();
  };

  dealPreparedSnapshotV3=async function(){
    const board=app.querySelector(".board");
    if(!board){emitAudioHook("deal");return;}
    board.classList.add("initial-deal-lite");
    void board.offsetWidth;
    board.classList.add("initial-deal-lite-run");
    await delay(690);
    board.classList.remove("initial-deal-lite-run","initial-deal-lite");
    emitAudioHook("deal");
  };

  window.__hanafudaInitialAnimationPerformanceVersion="1";
})();
