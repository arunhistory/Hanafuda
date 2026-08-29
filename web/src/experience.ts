let observedDepth=stack.length;
let navigationSyncing=false;
let onlineWarningDeadline=0;
let onlineWarningTimer:number|undefined;
let forcedTransitionTimer:number|undefined;
let forcedTransitionKey="";

function dealSequenceIndex(kind:"field"|"player"|"opponent",index:number,s:Snapshot){
  const group=Math.floor(index/2),within=index%2;
  if(kind==="field")return group*6+within;
  const seat=kind==="player"?playerSeat():opponentSeat();
  const offset=seat===s.dealer?4:2;
  return group*6+offset+within;
}

function applyDealSequence(){
  if(!snapshot||currentScreen()!=="match")return;
  const s=snapshot;
  app.querySelectorAll<HTMLElement>("[data-field-index]").forEach((el,i)=>el.style.setProperty("--deal-index",String(dealSequenceIndex("field",i,s))));
  app.querySelectorAll<HTMLElement>("[data-hand-index]").forEach((el,i)=>el.style.setProperty("--deal-index",String(dealSequenceIndex("player",i,s))));
  app.querySelectorAll<HTMLElement>(".opponent-zone .hand-row > .card").forEach((el,i)=>el.style.setProperty("--deal-index",String(dealSequenceIndex("opponent",i,s))));
}

function renderOnlineWarning(){
  let badge=document.querySelector<HTMLElement>("#online-overtime");
  const active=session?.kind==="online"&&onlineWarningDeadline>Date.now()&&currentScreen()==="match";
  if(!active){badge?.remove();return;}
  if(!badge){badge=document.createElement("div");badge.id="online-overtime";badge.className="online-overtime";badge.setAttribute("role","status");document.body.append(badge);}
  const remain=Math.max(0,Math.ceil((onlineWarningDeadline-Date.now())/1000));
  badge.textContent=`延長 ${remain}秒`;
}

function stopOnlineWarning(){
  onlineWarningDeadline=0;
  if(onlineWarningTimer!==undefined){window.clearInterval(onlineWarningTimer);onlineWarningTimer=undefined;}
  renderOnlineWarning();
}

function startOnlineWarning(){
  stopOnlineWarning();
  onlineWarningDeadline=Date.now()+30000;
  renderOnlineWarning();
  onlineWarningTimer=window.setInterval(()=>{
    renderOnlineWarning();
    if(onlineWarningDeadline<=Date.now())stopOnlineWarning();
  },250);
}

function detailedRulesHtml(){
  return `<div class="rules-detail" data-rules-detail="1"><h3>札の取り方</h3><p>手札から1枚出した後、山札の先頭を1枚めくります。どちらの札も同じ月の場札がある場合は取得処理を行います。</p><ul><li>同じ月が0枚：その札を場に置きます。</li><li>同じ月が1枚：出した札と場札を取得します。</li><li>同じ月が2枚：取る1枚を選び、2枚を取得します。</li><li>同じ月が3枚：4枚すべてを取得します。</li></ul><p>取得できる札がある場合、意図的に場へ捨てることはできません。山札からめくった札も同じ規則で処理します。</p><h3>配札時の特殊成立</h3><p>手四・くっつきは60点でその局を終了します。双方が同時に成立した場合は0対0の流局として1局を消化し、親は変わりません。</p><h3>親と局の進行</h3><p>最初の親はランダムです。通常決着では前局の勝者が次局の親になります。流局では親を継続します。対局は設定した1〜12局を消化し、累計得点で勝敗を決めます。</p><h3>こいこい後</h3><p>こいこいは1局につき1回までです。双方の残り手札が3枚未満になった時点では選択できません。こいこい後に得点した側の局得点は2倍で、7点以上などによる追加倍率はありません。</p><h3>最終同点</h3><p>最終累計点が同点の場合、その最終同点スコアへ先に到達した側を勝者とします。</p><h3>オンライン対戦</h3><p>部屋参加前に局数とこいこい設定を確認できます。対局開始後のルールは固定です。1手の持ち時間は60秒で、その後30秒の延長警告があります。実通信が切断した場合は1分以内の再接続を待ちます。</p></div>`;
}

function applyRulesDetail(){
  const rules=app.querySelector<HTMLElement>(".rules-copy");
  if(!rules||rules.querySelector("[data-rules-detail='1']"))return;
  const marker=rules.querySelector(".notice");
  if(marker)marker.insertAdjacentHTML("beforebegin",detailedRulesHtml());
  else rules.insertAdjacentHTML("beforeend",detailedRulesHtml());
}

function decorateFinalSettlement(card:HTMLElement){
  card.classList.add("enhanced-final");
  if(card.dataset.finalDecorated==="1"||!snapshot)return;
  card.dataset.finalDecorated="1";
  const title=card.querySelector("h2");
  if(title){
    const kicker=document.createElement("div");
    kicker.className="final-kicker";
    kicker.textContent="全局終了";
    title.before(kicker);
  }
  const [mine,theirs]=perspectiveScores(snapshot);
  if(mine===theirs&&(snapshot.matchWinner===0||snapshot.matchWinner===1)){
    const note=document.createElement("p");
    note.className="final-tiebreak-note";
    note.textContent="同点のため、最終同点スコアへ先に到達した側を勝者として判定しました。";
    card.querySelector(".screen-actions")?.before(note);
  }
  const firstHiddenAttempt=session?.kind==="cpu"&&session.mode==="impossible"&&!isUnlocked();
  if(firstHiddenAttempt){
    card.querySelector<HTMLElement>("[data-action='cpu-reconfigure']")?.remove();
    card.querySelector<HTMLElement>("[data-action='cpu-same']")?.remove();
  }
}

function decorateSettlement(){
  const card=app.querySelector<HTMLElement>(".settlement-card");
  if(!card)return;
  if(card.classList.contains("final")){
    decorateFinalSettlement(card);
    return;
  }
  const breakdown=card.querySelector<HTMLElement>(".settlement-breakdown");
  if(breakdown&&snapshot&&!breakdown.querySelector("[data-next-dealer='1']")){
    const nextDealer=document.createElement("div");
    nextDealer.dataset.nextDealer="1";
    const label=document.createElement("span");label.textContent="次局親";
    const value=document.createElement("strong");value.textContent=snapshot.dealer===playerSeat()?"あなた":"相手";
    nextDealer.append(label,value);
    breakdown.append(nextDealer);
  }
  if(settings.skipNormalAnimations)return;
  card.classList.add("staged-settlement");
  card.querySelectorAll<HTMLElement>(".settlement-breakdown > div").forEach((row,index)=>row.style.setProperty("--settle-index",String(index)));
}

function cancelForcedTransition(resetKey=false){
  if(forcedTransitionTimer!==undefined){window.clearTimeout(forcedTransitionTimer);forcedTransitionTimer=undefined;}
  if(resetKey)forcedTransitionKey="";
}

function lockForcedTransitionControl(){
  const button=app.querySelector<HTMLButtonElement>("[data-action='accept-transition']");
  if(!button)return;
  button.disabled=true;
  button.textContent="……";
  button.setAttribute("aria-label","次の対戦へ移行します");
}

function scheduleForcedTransition(){
  const s=session;
  const snap=snapshot;
  if(!(s?.kind==="cpu"&&s.mode!=="impossible"&&pendingModeTransition&&snap?.phase===5)){
    cancelForcedTransition(true);
    return;
  }
  lockForcedTransitionControl();
  const key=`${s.sessionId}:${s.version}:${snap.roundIndex}`;
  if(forcedTransitionKey===key)return;
  cancelForcedTransition(false);
  forcedTransitionKey=key;
  const hold=settings.skipNormalAnimations?1600:4300;
  forcedTransitionTimer=window.setTimeout(()=>{
    forcedTransitionTimer=undefined;
    if(session===s&&pendingModeTransition&&snapshot?.phase===5)void beginImpossibleTransition();
  },hold);
}

function applyMatchPresentation(){
  if(session?.kind==="cpu"&&session.mode==="impossible"&&isUnlocked())hiddenFirstEncounter=false;
  applyDealSequence();
  renderOnlineWarning();
  decorateSettlement();
  scheduleForcedTransition();
  const menu=app.querySelector<HTMLButtonElement>("[data-action='pause']");
  if(menu)menu.textContent="☰ メニュー";
  const final=app.querySelector<HTMLElement>(".settlement-card.final");
  if(final&&session?.kind==="cpu"&&session.mode==="impossible")final.classList.add("hidden-final");
}

function actionGhost(card:number,kind:"played"|"drawn",actor:number){
  const img=document.createElement("img");
  img.className=`action-ghost ${kind} ${actor===playerSeat()?"from-player":"from-opponent"}`;
  img.src=assets.card(card);
  img.alt="";
  img.setAttribute("aria-hidden","true");
  document.body.append(img);
  img.addEventListener("animationend",()=>img.remove(),{once:true});
  setTimeout(()=>img.remove(),1100);
}

function animateAuthoritativeAction(event:ActionEvent){
  if(settings.skipNormalAnimations||currentScreen()!=="match")return;
  const actor=Number(event.actor);
  if(Number.isInteger(event.playedCard))actionGhost(event.playedCard!,"played",actor);
  if(Number.isInteger(event.drawnCard))setTimeout(()=>actionGhost(event.drawnCard!,"drawn",actor),180);
}

function syncHistoryDepth(){
  if(navigationSyncing)return;
  const depth=stack.length;
  if(depth>observedDepth){history.pushState({hanafuda:true,depth},"");}
  else if(depth<observedDepth){history.replaceState({hanafuda:true,depth},"");}
  observedDepth=depth;
}

async function leaveCurrentHierarchyFromBrowser(){
  if(modal){modal=null;if(currentScreen()==="match")renderMatch();else void render();history.pushState({hanafuda:true,depth:stack.length},"");return;}
  if(stack.length<=1)return;
  navigationSyncing=true;stack.pop();observedDepth=stack.length;stopOnlineWarning();cancelForcedTransition(true);
  if(session)await closeMatch(false);else await render();
  navigationSyncing=false;
}

function installHierarchyNavigation(){
  history.replaceState({hanafuda:true,depth:stack.length},"");
  document.addEventListener("click",event=>{
    const target=(event.target as Element|null)?.closest<HTMLElement>("[data-action='back']");
    if(!target)return;event.preventDefault();event.stopImmediatePropagation();if(stack.length>1)history.back();
  },true);
  window.addEventListener("popstate",()=>void leaveCurrentHierarchyFromBrowser());
}

window.addEventListener("hanafuda-audio-hook",event=>{
  const detail=(event as CustomEvent<{name?:string;event?:ActionEvent}>).detail;
  if(detail?.name==="card-action"&&detail.event)animateAuthoritativeAction(detail.event);
});
window.addEventListener("pagehide",()=>{stopOnlineWarning();cancelForcedTransition(true);});

const experienceObserver=new MutationObserver(()=>{applyMatchPresentation();applyRulesDetail();syncHistoryDepth();});
experienceObserver.observe(app,{childList:true,subtree:true});
installHierarchyNavigation();
applyMatchPresentation();
applyRulesDetail();