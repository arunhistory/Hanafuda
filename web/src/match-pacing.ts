let matchRecapBlocking=false;

function actionActorLabel(event:ActionEvent){
  return Number(event.actor)===playerSeat()?"あなた":"相手";
}
function actionMonth(card:number){return Math.floor(card/4);}
function isTurnProgressEvent(event:ActionEvent){return event.type==="play"||event.type==="cpu_step";}
function hasHandPlay(event:ActionEvent){return isTurnProgressEvent(event)&&Number.isInteger(event.playedCard);}
function hasDeckReveal(event:ActionEvent){return isTurnProgressEvent(event)&&Number.isInteger(event.drawnCard);}
function captureGroups(event:ActionEvent){
  const pool=[...(event.capturedCards??[])];
  const takeFor=(card:number|null|undefined)=>{
    if(!Number.isInteger(card))return [] as number[];
    const month=actionMonth(card as number),taken:number[]=[];
    for(let i=pool.length-1;i>=0;i--)if(actionMonth(pool[i])===month)taken.unshift(pool.splice(i,1)[0]);
    return taken;
  };
  const hand=takeFor(hasHandPlay(event)?event.playedCard:null);
  const draw=takeFor(hasDeckReveal(event)?event.drawnCard:null);
  if(pool.length){
    if(hasDeckReveal(event))draw.push(...pool.splice(0));
    else hand.push(...pool.splice(0));
  }
  return {hand,draw};
}
function boardForAction(){return app.querySelector<HTMLElement>(".board");}
function boardMotion(board:HTMLElement){
  return {width:Math.max(1,board.clientWidth),height:Math.max(1,board.clientHeight)};
}
function actionLabel(event:ActionEvent,label:string){
  const el=document.createElement("div");
  el.className=`table-action-label ${Number(event.actor)===playerSeat()?"player-action":"opponent-action"}`;
  el.textContent=`${actionActorLabel(event)}・${label}`;
  return el;
}
async function showCardToField(event:ActionEvent,card:number,label:string,from:"hand"|"deck"){
  const board=boardForAction();if(!board)return;
  const {width,height}=boardMotion(board);
  const layer=document.createElement("div");layer.className="table-action-layer";
  const origin=from==="deck"?"from-deck":Number(event.actor)===playerSeat()?"from-player":"from-opponent";
  const fromX=from==="deck"?Math.round(width*.36):0;
  const fromY=from==="deck"?0:Math.round(height*(Number(event.actor)===playerSeat()?.43:-.43));
  layer.style.setProperty("--from-x",`${fromX}px`);
  layer.style.setProperty("--from-y",`${fromY}px`);
  layer.innerHTML=`<div class="table-action-card ${origin}">${cardImg(card)}</div>`;
  layer.append(actionLabel(event,label));board.append(layer);
  await delay(from==="deck"?900:880);
  layer.remove();await delay(260);
}
async function showDeckReveal(event:ActionEvent,card:number){
  const board=boardForAction();if(!board)return;
  const {width}=boardMotion(board);
  const deckOffset=Math.round(width*.36);
  const layer=document.createElement("div");layer.className="table-action-layer table-deck-layer";
  layer.style.setProperty("--deck-offset",`${deckOffset}px`);
  layer.innerHTML=`<div class="table-deck-source"><img src="${assets.path("cards.back")}" alt="山札"></div><div class="table-draw-card"><img class="draw-back" src="${assets.path("cards.back")}" alt="山札"><img class="draw-face" src="${assets.card(card)}" alt="山札からめくった札"></div>`;
  layer.append(actionLabel(event,"山札"));board.append(layer);
  await delay(1280);layer.remove();await delay(280);
}
async function showCaptureMove(event:ActionEvent,cards:number[]){
  if(!cards.length)return;
  const board=boardForAction();if(!board)return;
  const {width}=boardMotion(board);
  const toPlayer=Number(event.actor)===playerSeat();
  const captureOffset=Math.round(width*(toPlayer?-.42:.42));
  const layer=document.createElement("div");layer.className="table-action-layer";
  layer.style.setProperty("--capture-x",`${captureOffset}px`);
  layer.innerHTML=`<div class="table-capture-group ${toPlayer?"to-player":"to-opponent"}">${cards.slice(0,4).map(card=>cardImg(card)).join("")}</div>`;
  layer.append(actionLabel(event,"取得"));board.append(layer);
  await delay(1180);layer.remove();await delay(300);
}
async function showDecision(event:ActionEvent){
  const board=boardForAction();if(!board)return;
  const label=document.createElement("div");label.className="table-decision-label";label.textContent=event.chooseKoi?"こいこい":"あがり";board.append(label);
  await delay(1500);label.remove();await delay(400);
}

async function playVisibleActionSteps(event:ActionEvent){
  if(settings.skipNormalAnimations)return;
  matchRecapBlocking=true;
  try{
    const captures=captureGroups(event);
    if(hasHandPlay(event)){
      await showCardToField(event,event.playedCard!,"手札","hand");
      if(captures.hand.length)await showCaptureMove(event,captures.hand);
    }
    if(hasDeckReveal(event)){
      await showDeckReveal(event,event.drawnCard!);
      if(captures.draw.length)await showCaptureMove(event,captures.draw);
    }
    if(!hasHandPlay(event)&&!hasDeckReveal(event)&&event.capturedCards?.length){
      await showCaptureMove(event,event.capturedCards);
    }
    if(event.type==="koi")await showDecision(event);
    await delay(520);
  }finally{matchRecapBlocking=false;}
}

document.addEventListener("click",event=>{
  if(!matchRecapBlocking)return;
  const target=(event.target as Element|null)?.closest("#app button,#app [data-hand-index],#app [data-field-index]");
  if(!target)return;
  event.preventDefault();event.stopImmediatePropagation();
},true);
