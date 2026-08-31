let matchRecapBlocking=false;
let hiddenFieldDuringAction:HTMLElement[]=[];
let hiddenHandDuringAction:HTMLElement[]=[];

function actionActorLabel(event:ActionEvent){return Number(event.actor)===playerSeat()?"あなた":"相手";}
function actionMonth(card:number){return Math.floor(card/4);}
function isTurnProgressEvent(event:ActionEvent){return event.type==="play"||event.type==="cpu_step";}
function hasHandPlay(event:ActionEvent){return isTurnProgressEvent(event)&&Number.isInteger(event.playedCard);}
function hasDeckReveal(event:ActionEvent){return isTurnProgressEvent(event)&&Number.isInteger(event.drawnCard);}
function captureGroups(event:ActionEvent){
  const pool=[...(event.capturedCards??[])];
  const takeFor=(card:number|null|undefined)=>{
    if(!Number.isInteger(card))return [] as number[];
    const month=actionMonth(card!),taken:number[]=[];
    for(let i=pool.length-1;i>=0;i--)if(actionMonth(pool[i])===month)taken.unshift(pool.splice(i,1)[0]);
    return taken;
  };
  const hand=takeFor(hasHandPlay(event)?event.playedCard:null);
  const draw=takeFor(hasDeckReveal(event)?event.drawnCard:null);
  if(pool.length){if(hasDeckReveal(event))draw.push(...pool.splice(0));else hand.push(...pool.splice(0));}
  return {hand,draw};
}
function boardForAction(){return app.querySelector<HTMLElement>(".board");}
function boardMotion(board:HTMLElement){return {width:Math.max(1,board.clientWidth),height:Math.max(1,board.clientHeight)};}
function visualBoardOffset(horizontal:number,vertical:number){
  const viewport=document.querySelector<HTMLElement>(".webapp-viewport");
  const transform=viewport?getComputedStyle(viewport).transform:"none";
  if(transform&&transform!=="none"){
    try{
      const matrix=new DOMMatrixReadOnly(transform),determinant=matrix.a*matrix.d-matrix.b*matrix.c;
      if(Math.abs(determinant)>.000001)return {x:(matrix.d*horizontal-matrix.c*vertical)/determinant,y:(-matrix.b*horizontal+matrix.a*vertical)/determinant};
    }catch{}
  }
  const rotated=document.documentElement.classList.contains("virtual-landscape");
  return rotated?{x:vertical,y:-horizontal}:{x:horizontal,y:vertical};
}
function hideCapturedFieldCards(cards:number[]){
  if(!snapshot||!cards.length)return;
  const remaining=new Map<number,number>();for(const card of cards)remaining.set(card,(remaining.get(card)??0)+1);
  app.querySelectorAll<HTMLElement>(".field-card-button[data-field-index]").forEach(button=>{
    const index=Number(button.dataset.fieldIndex),card=Number.isInteger(index)?snapshot?.field[index]:undefined;
    if(!Number.isInteger(card))return;const left=remaining.get(card!)??0;if(left<=0)return;
    button.classList.add("capture-source-hidden");hiddenFieldDuringAction.push(button);remaining.set(card!,left-1);
  });
}
function hidePlayedHandSource(event:ActionEvent,card:number){
  const actorSeat=Number(event.actor);
  if(actorSeat===playerSeat()&&snapshot){
    const index=snapshot.hand.findIndex(value=>value===card);if(index<0)return;
    const button=app.querySelector<HTMLElement>(`.player-zone>.hand-row .hand-card-button[data-hand-index="${index}"]`);if(!button||button.classList.contains("capture-source-hidden"))return;
    button.classList.add("capture-source-hidden");hiddenHandDuringAction.push(button);return;
  }
  if(actorSeat===opponentSeat()){
    const backs=app.querySelectorAll<HTMLElement>(".opponent-zone>.hand-row .card-back:not(.capture-source-hidden)"),back=backs.item(backs.length-1);if(!back)return;
    back.classList.add("capture-source-hidden");hiddenHandDuringAction.push(back);
  }
}
function restoreHiddenSources(){for(const card of hiddenFieldDuringAction)card.classList.remove("capture-source-hidden");for(const card of hiddenHandDuringAction)card.classList.remove("capture-source-hidden");hiddenFieldDuringAction=[];hiddenHandDuringAction=[];}
function reflectCapturedRail(event:ActionEvent,nextState:Snapshot|null){
  if(!nextState)return;const actorSeat=Number(event.actor);if(actorSeat!==0&&actorSeat!==1)return;
  const selector=actorSeat===playerSeat()?".player-zone>.captured-box .captured-row":".opponent-zone>.captured-box .captured-row";const row=app.querySelector<HTMLElement>(selector);if(!row)return;
  row.innerHTML=capturedHtml(nextState.captured[actorSeat]??[]);row.classList.add("capture-rail-committed");
}
function actionLabel(event:ActionEvent,label:string){const el=document.createElement("div");el.className=`table-action-label ${Number(event.actor)===playerSeat()?"player-action":"opponent-action"}`;el.textContent=`${actionActorLabel(event)}・${label}`;return el;}
async function showCardToField(event:ActionEvent,card:number,label:string,from:"hand"|"deck"){
  const board=boardForAction();if(!board)return;if(from==="hand")hidePlayedHandSource(event,card);const {width,height}=boardMotion(board);
  const layer=document.createElement("div");layer.className="table-action-layer";const origin=from==="deck"?"from-deck":Number(event.actor)===playerSeat()?"from-player":"from-opponent";
  const visualHorizontal=from==="deck"?Math.round(width*.36):0,visualVertical=from==="deck"?0:Math.round(height*(Number(event.actor)===playerSeat()?.43:-.43)),offset=visualBoardOffset(visualHorizontal,visualVertical);
  layer.style.setProperty("--from-x",`${offset.x}px`);layer.style.setProperty("--from-y",`${offset.y}px`);layer.innerHTML=`<div class="table-action-card ${origin}">${cardImg(card)}</div>`;layer.append(actionLabel(event,label));board.append(layer);
  await delay(from==="deck"?900:880);layer.remove();await delay(180);
}
async function showDeckReveal(event:ActionEvent,card:number){
  const board=boardForAction();if(!board)return;const {width}=boardMotion(board),deckDistance=Math.round(width*.36),midDistance=Math.round(deckDistance*.52),start=visualBoardOffset(deckDistance,0),mid=visualBoardOffset(midDistance,0);
  const layer=document.createElement("div");layer.className="table-action-layer table-deck-layer";layer.style.setProperty("--deck-x",`${start.x}px`);layer.style.setProperty("--deck-y",`${start.y}px`);layer.style.setProperty("--deck-mid-x",`${mid.x}px`);layer.style.setProperty("--deck-mid-y",`${mid.y}px`);
  layer.innerHTML=`<div class="table-deck-source"><img src="${assets.path("cards.back")}" alt="山札"></div><div class="table-draw-card"><img class="draw-back" src="${assets.path("cards.back")}" alt="山札"><img class="draw-face" src="${assets.card(card)}" alt="山札からめくった札"></div>`;layer.append(actionLabel(event,"山札"));board.append(layer);await delay(1280);layer.remove();await delay(180);
}
async function showCaptureMove(event:ActionEvent,cards:number[],nextState:Snapshot|null){
  if(!cards.length)return;const board=boardForAction();if(!board)return;hideCapturedFieldCards(cards);const {width}=boardMotion(board),toPlayer=Number(event.actor)===playerSeat(),target=visualBoardOffset(Math.round(width*(toPlayer?-.42:.42)),0);
  const layer=document.createElement("div");layer.className="table-action-layer";layer.style.setProperty("--capture-x",`${target.x}px`);layer.style.setProperty("--capture-y",`${target.y}px`);layer.innerHTML=`<div class="table-capture-group ${toPlayer?"to-player":"to-opponent"}">${cards.slice(0,4).map(card=>cardImg(card)).join("")}</div>`;layer.append(actionLabel(event,"取得"));board.append(layer);await delay(1120);reflectCapturedRail(event,nextState);layer.remove();
}
async function showReadyGate(){const board=boardForAction();if(!board)return;const label=document.createElement("div");label.className="table-ready-label";label.textContent="用意完了";board.append(label);await delay(settings.skipNormalAnimations?220:720);label.remove();}
async function playVisibleActionSteps(event:ActionEvent,nextState:Snapshot|null=snapshot){
  if(settings.skipNormalAnimations)return;hiddenFieldDuringAction=[];hiddenHandDuringAction=[];matchRecapBlocking=true;let completed=false;
  try{
    const captures=captureGroups(event);
    if(hasHandPlay(event)){await showCardToField(event,event.playedCard!,"手札","hand");if(captures.hand.length)await showCaptureMove(event,captures.hand,nextState);}
    if(hasDeckReveal(event)){await showDeckReveal(event,event.drawnCard!);if(captures.draw.length)await showCaptureMove(event,captures.draw,nextState);}
    if(!hasHandPlay(event)&&!hasDeckReveal(event)&&event.capturedCards?.length)await showCaptureMove(event,event.capturedCards,nextState);
    // A koi decision never gets a second intermediate UI here. The selection screen is removed first,
    // then the chosen koi/agari effect is the only visual acknowledgement.
    await delay(160);completed=true;
  }finally{if(!completed)restoreHiddenSources();matchRecapBlocking=false;}
}
document.addEventListener("click",event=>{if(!matchRecapBlocking)return;const target=(event.target as Element|null)?.closest("#app button,#app [data-hand-index],#app [data-field-index]");if(!target)return;event.preventDefault();event.stopImmediatePropagation();},true);
