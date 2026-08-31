(()=>{
  const runtimeWindow=window as Window & {
    showShuffle:typeof showShuffle;
    dealPreparedSnapshotV3:typeof dealPreparedSnapshotV3;
    __hanafudaInitialAnimationPerformanceVersion?:string;
  };
  const baseShowShuffle=showShuffle;

  runtimeWindow.showShuffle=async function(initial=false){
    if(!initial)return baseShowShuffle(false);
    const layer=document.createElement("div");
    layer.className="fx-layer shuffle-layer long-shuffle initial-shuffle-lite";
    layer.innerHTML='<div class="shuffle-deck"><i class="shuffle-card" style="--sx:1;--sr:1"></i><i class="shuffle-card" style="--sx:-1;--sr:-1"></i></div>';
    matchEffectHost().append(layer);
    emitAudioHook("shuffle");
    await delay(1080);
    layer.remove();
  };

  runtimeWindow.dealPreparedSnapshotV3=async function(){
    const board=app.querySelector<HTMLElement>(".board");
    if(!board){emitAudioHook("deal");return;}
    const back=assets.path("cards.back");
    const cards=()=>`<img src="${back}" alt="" aria-hidden="true"><img src="${back}" alt="" aria-hidden="true"><img src="${back}" alt="" aria-hidden="true">`;
    const stage=document.createElement("div");
    stage.className="initial-deal-stage";
    stage.innerHTML=`<div class="initial-deal-flight to-opponent">${cards()}</div><div class="initial-deal-flight to-field">${cards()}</div><div class="initial-deal-flight to-player">${cards()}</div>`;
    board.append(stage);
    await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
    stage.classList.add("run");
    await delay(620);
    stage.remove();
    emitAudioHook("deal");
  };

  runtimeWindow.__hanafudaInitialAnimationPerformanceVersion="2";
})();
