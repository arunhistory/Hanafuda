let matchRecapBlocking=false;

function actionActorLabel(event:ActionEvent){
  return Number(event.actor)===playerSeat()?"あなた":"相手";
}

async function showPacedStep(event:ActionEvent,label:string,body:string,holdMs:number){
  matchRecapBlocking=true;
  const layer=document.createElement("div");
  layer.className=`match-action-recap ${Number(event.actor)===playerSeat()?"player-action":"opponent-action"}`;
  layer.innerHTML=`<section class="match-action-card"><strong>${actionActorLabel(event)}</strong><div class="paced-step"><span>${label}</span>${body}</div></section>`;
  app.append(layer);
  await delay(holdMs);
  layer.remove();
  await delay(420);
}

async function playVisibleActionSteps(event:ActionEvent){
  if(settings.skipNormalAnimations)return;
  try{
    if(Number.isInteger(event.playedCard)){
      await showPacedStep(event,"手札から",cardImg(event.playedCard!),1250);
    }
    if(event.capturedCards?.length&&Number.isInteger(event.playedCard)){
      await showPacedStep(event,"場札を取得",`<div class="recap-cards">${event.capturedCards.slice(0,4).map(card=>cardImg(card)).join("")}</div>`,1350);
    }
    if(Number.isInteger(event.drawnCard)){
      await showPacedStep(event,"山札から",cardImg(event.drawnCard!),1250);
    }
    if(event.capturedCards?.length&&!Number.isInteger(event.playedCard)){
      await showPacedStep(event,"取得",`<div class="recap-cards">${event.capturedCards.slice(0,4).map(card=>cardImg(card)).join("")}</div>`,1350);
    }
    if(event.type==="koi"){
      await showPacedStep(event,event.chooseKoi?"こいこい":"あがり","",1450);
    }
    await delay(650);
  }finally{
    matchRecapBlocking=false;
  }
}

document.addEventListener("click",event=>{
  if(!matchRecapBlocking)return;
  const target=(event.target as Element|null)?.closest("#app button,#app [data-hand-index],#app [data-field-index]");
  if(!target)return;
  event.preventDefault();
  event.stopImmediatePropagation();
},true);
