function onlineRulesFromUi(){return {rounds:Number(app.querySelector<HTMLSelectElement>("#online-rounds")?.value??12),koiEnabled:app.querySelector<HTMLInputElement>("#online-koi")?.checked??true};}
let inspectedRoom:{code:string;rules:{rounds:number;koiEnabled:boolean}}|null=null;
let matchmakingSocket:WebSocket|null=null;

function setMatchmakingUi(active:boolean){
  const random=app.querySelector<HTMLButtonElement>("[data-action='online-random']");if(random){random.textContent=active?"マッチング中止":"ランダム対戦";random.classList.toggle("danger",active);random.classList.toggle("secondary",!active);}
  app.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLButtonElement>("#online-rounds,#online-koi,#room-code,[data-action='online-create'],[data-action='online-inspect'],[data-action='online-join']").forEach(el=>el.disabled=active||((el as HTMLElement).dataset.action==="online-join"&&!inspectedRoom));
}
function cancelRandomMatch(renderAfter=true){
  const ws=matchmakingSocket;matchmakingSocket=null;busy=false;
  if(ws){try{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:"cancel"}));}catch{}try{ws.close(1000,"cancelled");}catch{}}
  if(renderAfter&&currentScreen()==="online")void render();
}

async function createOnlineRoom(){
  if(busy)return;busy=true;try{const rules=onlineRulesFromUi(),r=await api("/api/online/create",{rules});if(!r.ok||!r.data?.ok)throw new Error(r.data?.code||"ROOM_CREATE_FAILED");toast(`ルームコード: ${r.data.roomCode}`);await startOnlineSession(r.data.roomCode,r.data.hostToken,0,rules,null);}catch(e){toast(e instanceof Error?e.message:"部屋作成に失敗しました");}finally{busy=false;}
}
async function inspectOnlineRoom(){
  if(matchmakingSocket)return;const input=app.querySelector<HTMLInputElement>("#room-code");if(!input)return;const code=input.value.trim().toUpperCase();
  try{const response=await fetch(`${API_BASE}/api/online/inspect?room=${encodeURIComponent(code)}`,{cache:"no-store"}),data=await response.json().catch(()=>null);if(!response.ok||!data?.ok)throw new Error(data?.code||"ROOM_INSPECT_FAILED");inspectedRoom={code,rules:data.rules};const box=app.querySelector<HTMLElement>("#room-inspect");if(box)box.textContent=`${data.rules.rounds}局 / こいこい ${data.rules.koiEnabled?"あり":"なし"}`;const join=app.querySelector<HTMLButtonElement>("[data-action='online-join']");if(join)join.disabled=false;}catch(e){inspectedRoom=null;toast(e instanceof Error?e.message:"確認に失敗しました");}
}
async function joinOnlineRoom(){
  if(!inspectedRoom||busy||matchmakingSocket)return;busy=true;try{const r=await api("/api/online/join",{roomCode:inspectedRoom.code});if(!r.ok||!r.data?.ok)throw new Error(r.data?.code||"ROOM_JOIN_FAILED");await startOnlineSession(inspectedRoom.code,r.data.guestToken,1,r.data.rules,r.data);}catch(e){toast(e instanceof Error?e.message:"参加できません");}finally{busy=false;}
}
function randomOnline(){
  if(matchmakingSocket){cancelRandomMatch();return;}
  if(busy)return;
  const rules=onlineRulesFromUi();settings.rounds=rules.rounds;settings.koiEnabled=rules.koiEnabled;saveSettings();busy=true;
  const url=new URL(API_BASE.replace(/^http/,"ws")+"/api/online/random/connect");url.searchParams.set("rounds",String(rules.rounds));url.searchParams.set("koiEnabled",String(rules.koiEnabled));
  const ws=new WebSocket(url);matchmakingSocket=ws;let matched=false;setMatchmakingUi(true);
  const cancelOnNavigate=()=>cancelRandomMatch(false);
  app.querySelector<HTMLElement>("[data-action='back']")?.addEventListener("click",cancelOnNavigate,{capture:true,once:true});
  app.querySelector<HTMLElement>("[data-action='home']")?.addEventListener("click",cancelOnNavigate,{capture:true,once:true});
  ws.onopen=()=>toast("対戦相手を待っています…");
  ws.onmessage=event=>{
    let msg:any;try{msg=JSON.parse(String(event.data));}catch{return;}
    if(msg?.type==="queued")return;
    if(msg?.type==="timeout"){toast("マッチング時間を超えました。");cancelRandomMatch();return;}
    if(msg?.type==="error"){toast(msg.code||"マッチングに失敗しました");cancelRandomMatch();return;}
    if(msg?.type!=="matched"||matchmakingSocket!==ws)return;
    matched=true;matchmakingSocket=null;busy=false;try{ws.close(1000,"matched");}catch{}
    const seat:Seat=msg.seat==="guest"?1:0;const matchRules=msg.rules as {rounds:number;koiEnabled:boolean};
    void startOnlineSession(String(msg.roomCode),String(msg.token),seat,matchRules,null);
  };
  ws.onerror=()=>{if(matchmakingSocket===ws)toast("マッチング通信でエラーが発生しました。");};
  ws.onclose=()=>{if(matchmakingSocket!==ws)return;matchmakingSocket=null;busy=false;if(!matched)toast("マッチングを終了しました。");if(currentScreen()==="online")void render();};
}
async function startOnlineSession(code:string,token:string,seat:Seat,rules:{rounds:number;koiEnabled:boolean},initial:any){
  stopOnlineWarning();
  const provisional:OnlineSession={kind:"online",roomCode:code,token,seat,version:Number(initial?.version??-1),epoch:String(initial?.epoch??""),rules,socket:null};session=provisional;snapshot=initial?.snapshot??null;roundHistory=[];currentRound=-1;stack=["home","online","match"];
  connectOnlineSocket(provisional);if(snapshot){renderMatch();await animateNewRoundIfNeeded(true);}else{app.innerHTML=`<main class="${screenClass()}"><section class="hero"><h1>待機中</h1><p>ルームコード ${escapeHtml(code)}</p><p>相手の参加と接続を待っています。</p><button class="danger" data-action="wait-cancel">退出</button></section></main>`;app.querySelector<HTMLElement>("[data-action='wait-cancel']")!.onclick=()=>void closeMatch(true);}
}
function connectOnlineSocket(s:OnlineSession){
  const url=new URL(API_BASE.replace(/^http/,"ws")+"/api/online/connect");url.searchParams.set("room",s.roomCode);url.searchParams.set("token",s.token);const ws=new WebSocket(url);s.socket=ws;
  ws.onmessage=event=>{try{const msg=JSON.parse(String(event.data));void handleOnlineMessage(msg);}catch{}};ws.onclose=()=>{if(session===s)toast("通信が切断されました。1分以内に再接続します。"),setTimeout(()=>{if(session===s&&s.socket?.readyState===WebSocket.CLOSED)connectOnlineSocket(s);},1800);};
}
async function handleOnlineMessage(msg:any){
  if(!session||session.kind!=="online")return;
  if(msg?.type==="connected"||msg?.type==="state"){
    stopOnlineWarning();
    const prior=snapshot,priorVersion=session.version,priorEpoch=session.epoch,incomingVersion=Number(msg.version),incomingEpoch=msg.epoch?String(msg.epoch):priorEpoch;
    const epochChanged=!!priorEpoch&&!!incomingEpoch&&incomingEpoch!==priorEpoch;
    const isNewAction=!!msg.actionEvent&&!epochChanged&&(!Number.isSafeInteger(incomingVersion)||incomingVersion>priorVersion);
    if(msg.epoch)session.epoch=incomingEpoch;if(Number.isSafeInteger(incomingVersion))session.version=incomingVersion;
    if(epochChanged){roundHistory=[];currentRound=-1;}
    if(msg.snapshot){
      snapshot=msg.snapshot;onlineReconfigureState="none";
      if(isNewAction){recordHistory(msg.actionEvent,msg.actionEvent?.actor===playerSeat()?"player":"opponent");if(!settings.skipNormalAnimations)await animateEvent(msg.actionEvent);}
      renderMatch();await animateNewRoundIfNeeded(!prior||epochChanged);
    }
  }else if(msg?.type==="postmatch_choice"){
    if(msg.choice==="reconfigure"){onlineReconfigureState=session.seat===0?"host":"guest";renderMatch();}
    else if(msg.choice==="home")void closeMatch(true);
  }else if(msg?.type==="rules_changed"){
    if(msg.rules)session.rules=msg.rules;
  }else if(msg?.type==="turn_warning"){
    startOnlineWarning();toast("持ち時間60秒を超えました。あと30秒です。");
  }else if(msg?.type==="timeout"){
    stopOnlineWarning();toast("通信タイムアウトのため対局を終了します。");void closeMatch(true);
  }else if(msg?.type==="disconnect"){
    stopOnlineWarning();toast("対戦相手の通信が切断されました。復帰を待っています。");
  }else if(msg?.type==="closed"){
    stopOnlineWarning();void closeMatch(true);
  }
}
async function onlinePostmatch(choice:"reconfigure"|"same"|"home"){
  if(!session||session.kind!=="online")return;const s=session;
  const r=await api("/api/online/postmatch",{roomCode:s.roomCode,token:s.token,epoch:s.epoch,version:s.version,choice});
  if(!r.ok||!r.data?.ok){toast(r.data?.code||"終了後処理に失敗しました");return;}
  const lockedChoice=String(r.data.choice??choice) as "reconfigure"|"same"|"home";
  if(r.data.locked&&lockedChoice!==choice)toast(`先着の選択「${lockedChoice}」が適用されました`);
  if(lockedChoice==="home"){stopOnlineWarning();await closeMatch(true);return;}
  if(lockedChoice==="reconfigure"){onlineReconfigureState=s.seat===0?"host":"guest";renderMatch();return;}
  if(lockedChoice==="same"&&r.data.snapshot){const prior=snapshot;s.epoch=String(r.data.epoch??s.epoch);s.version=Number(r.data.version??s.version);snapshot=r.data.snapshot;onlineReconfigureState="none";roundHistory=[];currentRound=-1;renderMatch();await animateNewRoundIfNeeded(!prior||prior.phase===6);}
}
async function applyOnlineReconfigure(){
  if(!session||session.kind!=="online"||session.seat!==0||onlineReconfigureState!=="host")return;
  const rounds=Number(app.querySelector<HTMLSelectElement>("#reconfig-rounds")?.value??session.rules.rounds),koiEnabled=app.querySelector<HTMLInputElement>("#reconfig-koi")?.checked??session.rules.koiEnabled;
  const r=await api("/api/online/reconfigure",{roomCode:session.roomCode,token:session.token,epoch:session.epoch,rules:{rounds,koiEnabled}});
  if(!r.ok||!r.data?.ok){toast(r.data?.code||"再設定に失敗しました");return;}
  session.rules=r.data.rules;session.epoch=String(r.data.epoch);session.version=Number(r.data.version);snapshot=r.data.snapshot;onlineReconfigureState="none";roundHistory=[];currentRound=-1;renderMatch();await animateNewRoundIfNeeded(true);
}

window.addEventListener("pagehide",()=>{
  stopOnlineWarning();
  const waiting=matchmakingSocket;matchmakingSocket=null;if(waiting){try{if(waiting.readyState===WebSocket.OPEN)waiting.send(JSON.stringify({type:"cancel"}));}catch{}try{waiting.close(1000,"pagehide");}catch{}}
  const s=session;if(!s)return;
  if(s.kind==="cpu")navigator.sendBeacon?.(`${API_BASE}/api/cpu/close`,new Blob([JSON.stringify({sessionId:s.sessionId,token:s.token})],{type:"text/plain;charset=UTF-8"}));
  else navigator.sendBeacon?.(`${API_BASE}/api/online/close`,new Blob([JSON.stringify({roomCode:s.roomCode,token:s.token,reason:"pagehide"})],{type:"text/plain;charset=UTF-8"}));
});

void render();