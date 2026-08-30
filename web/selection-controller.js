(()=>{
  let stagedHand=null;
  let committing=false;

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
      if(fieldIndex!==null&&snapshot&&snapshot.turn===playerSeat()&&(snapshot.phase===2||snapshot.phase===3)){
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
})();
