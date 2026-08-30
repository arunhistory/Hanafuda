function actionActorLabel(event:ActionEvent){
  return Number(event.actor)===playerSeat()?"あなた":"相手";
}

function actionRecapRows(event:ActionEvent){
  const rows:string[]=[];
  if(Number.isInteger(event.playedCard))rows.push(`<div><span>手札から</span>${cardImg(event.playedCard!)}</div>`);
  if(Number.isInteger(event.drawnCard))rows.push(`<div><span>山札から</span>${cardImg(event.drawnCard!)}</div>`);
  if(event.capturedCards?.length)rows.push(`<div class="captured"><span>取得</span><div class="recap-cards">${event.capturedCards.slice(0,4).map(cardImg).join("")}</div></div>`);
  if(event.type==="koi")rows.push(`<div class="decision"><span>${event.chooseKoi?"こいこい":"あがり"}</span></div>`);
  return rows.join("");
}

async function showActionRecap(event:ActionEvent){
  const rows=actionRecapRows(event);
  if(!rows)return;
  const layer=document.createElement("div");
  layer.className=`match-action-recap ${Number(event.actor)===playerSeat()?"player-action":"opponent-action"}`;
  layer.innerHTML=`<section class="match-action-card"><strong>${actionActorLabel(event)}</strong>${rows}</section>`;
  app.append(layer);
  await delay(event.capturedCards?.length?1050:820);
  layer.remove();
}

acceptSnapshot=async function(next:Snapshot,event:ActionEvent|null,actor?:string){
  const old=snapshot;
  snapshot=next;
  if(event)recordHistory(event,actor);
  if(old&&old.roundIndex!==next.roundIndex){roundHistory=[];currentRound=-1;}
  if(currentScreen()==="match")renderMatch();
  if(event&&!settings.skipNormalAnimations)await animateEvent(event);
};

animateEvent=async function(event:ActionEvent){
  if(currentScreen()==="match")renderMatch();
  await showActionRecap(event);
  if(event.capturedCards?.length)toast(`${actionActorLabel(event)}が取得: ${event.capturedCards.map(cardName).join("・")}`);
  if(event.newYakuMask)toast(`${actionActorLabel(event)} 役成立: ${yakuNames(event.newYakuMask)}`);
  if(event.capturedCards?.length)await showCaptureTrail(event.capturedCards,event.actor===playerSeat());
  if(event.settlement&&event.settlement.winner!==2){
    await showCallout("effect.agari.text");
    const label=confirmedSettlementYaku(event);
    if(label&&label!=="なし")await showAgariYaku(label);
  }
  emitAudioHook("card-action",{event});
  await delay(280);
};
