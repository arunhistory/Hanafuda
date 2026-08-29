async function render(){
  await assets.load().catch(()=>null);
  const screen=currentScreen();
  if(screen==="home")renderHome();
  else if(screen==="cpu-setup")renderCpuSetup();
  else if(screen==="online")renderOnline();
  else if(screen==="settings")renderSettingsScreen();
  else if(screen==="rules")renderRules();
  else if(screen==="match")renderMatch();
  bindGlobalActions();
}

function renderHome(){
  app.innerHTML=`<main class="${screenClass()}"><section class="hero"><h1>花札</h1><p>こいこい</p><div class="home-actions"><button class="primary" data-nav="cpu-setup">CPU対戦</button><button class="secondary" data-nav="online">オンライン対戦</button><button class="secondary" data-nav="settings">設定</button><button class="secondary" data-nav="rules">遊び方・役</button></div></section></main>`;
}

function difficultyOptions(){
  const modes:CpuMode[]=isUnlocked()?["beginner","amateur","pro","impossible"]:["beginner","amateur","pro"];
  if(!modes.includes(settings.mode))settings.mode="pro";
  return modes.map(m=>`<option value="${m}" ${settings.mode===m?"selected":""}>${modeLabel(m)}</option>`).join("");
}
function renderCpuSetup(){
  app.innerHTML=`<main class="${screenClass()}">${topbar("CPU対戦設定")}<section class="panel"><div class="settings-grid"><label for="cpu-mode">CPU難易度</label><select id="cpu-mode">${difficultyOptions()}</select><label for="rounds">局数</label><select id="rounds">${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${settings.rounds===i+1?"selected":""}>${i+1}局</option>`).join("")}</select><label for="dealer-mode">親決め</label><select id="dealer-mode"><option value="random">ランダム</option></select><label for="koi-enabled">こいこい</label><div class="check-row"><input id="koi-enabled" type="checkbox" ${settings.koiEnabled?"checked":""}><span>使用する</span></div></div><div class="screen-actions"><button class="primary" data-action="start-cpu">対局開始</button></div></section></main>`;
}

function renderOnline(){
  app.innerHTML=`<main class="${screenClass()}">${topbar("オンライン対戦")}<section class="panel"><h2>部屋を作る</h2><div class="settings-grid"><label for="online-rounds">局数</label><select id="online-rounds">${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${settings.rounds===i+1?"selected":""}>${i+1}局</option>`).join("")}</select><label for="online-koi">こいこい</label><div class="check-row"><input id="online-koi" type="checkbox" ${settings.koiEnabled?"checked":""}><span>使用する</span></div></div><div class="screen-actions"><button class="primary" data-action="online-create">部屋作成</button><button class="secondary" data-action="online-random">ランダム対戦</button></div></section><section class="panel"><h2>ルームコードで参加</h2><div class="settings-grid"><label for="room-code">ルームコード</label><input id="room-code" maxlength="6" autocomplete="off" inputmode="text" style="text-transform:uppercase" placeholder="6文字"></div><div id="room-inspect" class="notice" style="margin-top:10px">コードを入力すると参加前にルールを確認できます。</div><div class="screen-actions"><button class="primary" data-action="online-inspect">ルール確認</button><button class="secondary" data-action="online-join" disabled>参加</button></div></section></main>`;
}

function renderSettingsScreen(){
  app.innerHTML=`<main class="${screenClass()}">${topbar("設定")}<section class="panel"><div class="settings-grid"><label for="skip-animations">通常演出</label><div class="check-row"><input id="skip-animations" type="checkbox" ${settings.skipNormalAnimations?"checked":""}><span>通常演出をスキップ</span></div><label>音響</label><div class="notice">BGM / SE は追加用フックのみ。音源は未設定です。</div></div></section></main>`;
}

function renderRules(){
  app.innerHTML=`<main class="${screenClass()}">${topbar("遊び方・役")}<section class="panel rules-copy"><h3>基本</h3><p>2人対戦。手札8枚ずつ、場8枚、山札24枚で開始します。親が先攻し、手札を1枚出した後に山札の先頭1枚を引きます。同月札が場にあれば通常のこいこいの取り札規則に従って取得します。</p><h3>こいこい</h3><p>1局につき1回まで。両者の手札がそれぞれ3枚未満になった時点では選択できません。こいこい後の得点倍率は2倍のみです。</p><h3>流局</h3><p>双方0点で1局を消化し、親は継続します。配札時に双方が同時に手四・くっつきを成立させた場合も流局です。</p><h3>役と得点</h3>${yakuTable()}<p class="notice">任天堂株式会社が公開する花札「こいこい」の遊び方を参考にしています。本ゲームは任天堂株式会社の公式・公認・提携サービスではありません。</p></section></main>`;
}
function yakuTable(){return `<table class="data-table"><thead><tr><th>役</th><th>得点</th><th>成立</th></tr></thead><tbody>${YAKU_DETAILS.map(r=>`<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join("")}</tbody></table>`;}

function cardImg(card:number,className="card"){return `<img class="${className}" src="${assets.card(card)}" alt="${Math.floor(card/4)+1}月の札" draggable="false">`;}
function backs(count:number){const src=assets.path("cards.back");return Array.from({length:Math.min(count,8)},()=>`<img class="card card-back" src="${src}" alt="裏向きの札" draggable="false">`).join("");}
function capturedHtml(cards:number[]){return cards.map(c=>cardImg(c)).join("");}
function handHtml(s:Snapshot){
  const clickable=s.turn===playerSeat()&&s.phase===1&&!busy;
  return s.hand.map((c,i)=>`<button class="hand-card-button" style="--deal-index:${i}" data-hand-index="${i}" ${clickable?"":"disabled"}>${cardImg(c)}</button>`).join("");
}
function fieldHtml(s:Snapshot){
  const choosing=s.turn===playerSeat()&&(s.phase===2||s.phase===3);
  const pending=new Set(s.pendingMatches);
  return s.field.map((c,i)=>`<div class="field-slot"><button class="field-card-button ${choosing&&pending.has(i)?"selectable":""}" style="--deal-index:${8+i}" data-field-index="${i}" ${choosing&&pending.has(i)&&!busy?"":"disabled"}>${cardImg(c)}</button></div>`).join("");
}
function opponentLabel(){if(session?.kind==="cpu"){if(session.mode==="impossible")return hiddenFirstEncounter?"▧▒░█?▒":"人知不能";return "CPU / "+modeLabel(session.mode);}return "対戦相手";}

function renderMatch(){
  if(!snapshot||!session){goHome();return;}
  const s=snapshot, [myScore,oppScore]=perspectiveScores(s),[myCap,oppCap]=perspectiveCaptured(s),corrupted=session.kind==="cpu"&&session.mode==="impossible";
  const round=Math.min(s.roundIndex+1,s.totalRounds);
  app.innerHTML=`<main class="${screenClass(`match-screen ${corrupted?"corrupted":""}`)}"><header class="match-hud"><div class="scorebox"><span>${escapeHtml(opponentLabel())}</span><span class="score">${oppScore}</span></div><div class="round-info">${round} / ${s.totalRounds}局<br>${s.dealer===playerSeat()?"あなたが親":s.dealer===opponentSeat()?"相手が親":""}</div><div class="scorebox right"><span class="score">${myScore}</span><span>あなた</span></div></header><section class="board"><div class="opponent-zone"><div class="hand-row">${backs(s.opponentHandCount)}</div><div class="captured-box"><div class="captured-title">相手の取得札</div><div class="captured-row">${capturedHtml(oppCap)}</div></div></div><div class="field-wrap"><div class="field-grid">${fieldHtml(s)}</div></div><div class="player-zone"><div class="captured-box"><div class="captured-title">あなたの取得札</div><div class="captured-row">${capturedHtml(myCap)}</div></div><div class="hand-row">${handHtml(s)}</div></div></section><div class="status-strip"><span class="status-message">${escapeHtml(phaseLabel(s))}　山札 ${s.deckRemaining}枚</span><span class="status-actions"><button class="icon-button" data-action="pause">☰ 履歴</button></span></div>${renderMatchOverlay()}</main>`;
  bindMatchActions();
}

function renderMatchOverlay(){
  if(!snapshot)return "";
  if(modal)return renderPauseModal();
  if(onlineReconfigureState!=="none")return renderOnlineReconfigure();
  if(snapshot.phase===4&&snapshot.turn===playerSeat()){
    return `<div class="modal-layer"><div class="modal"><h2>役成立</h2><p style="text-align:center">現在の成立役：${escapeHtml(yakuNames(snapshot.yakuMasks[playerSeat()]))}</p><p style="text-align:center">上がり点 ${snapshot.offeredScore}点</p><div class="koi-choice"><button class="primary" data-action="koi-continue">こいこい</button><button class="secondary" data-action="koi-finish">あがる</button></div></div></div>`;
  }
  if(snapshot.phase===5)return renderSettlement(false);
  if(snapshot.phase===6)return renderSettlement(true);
  return "";
}


function renderOnlineReconfigure(){
  if(onlineReconfigureState==="guest")return `<div class="modal-layer"><section class="modal"><h2>条件を再設定</h2><p>ホストが次の対局条件を設定しています。</p></section></div>`;
  const rules=session?.kind==="online"?session.rules:{rounds:settings.rounds,koiEnabled:settings.koiEnabled};
  return `<div class="modal-layer"><section class="modal"><h2>再戦条件</h2><div class="settings-grid"><label for="reconfig-rounds">局数</label><select id="reconfig-rounds">${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${rules.rounds===i+1?"selected":""}>${i+1}局</option>`).join("")}</select><label for="reconfig-koi">こいこい</label><div class="check-row"><input id="reconfig-koi" type="checkbox" ${rules.koiEnabled?"checked":""}><span>使用する</span></div></div><div class="screen-actions"><button class="primary" data-action="apply-online-reconfigure">この条件で再戦</button></div></section></div>`;
}

function renderPauseModal(){
  if(!modal)return "";
  if(modal==="pause")return `<div class="modal-layer"><section class="modal"><h2>対局中メニュー</h2><div class="modal-list"><button class="menu-item" data-modal="close"><strong>再開</strong></button><button class="menu-item" data-modal="yaku"><strong>役の得点と組み合わせ</strong></button><button class="menu-item" data-modal="state"><strong>現状</strong></button><button class="menu-item" data-modal="history"><strong>履歴</strong><span>現在局のみ</span></button><button class="menu-item" data-modal="rules"><strong>ルール確認</strong></button><button class="menu-item" data-modal="settings"><strong>設定</strong></button><button class="menu-item danger" data-modal="giveup"><strong>諦める</strong></button></div></section></div>`;
  const backButton='<button class="secondary" data-modal="pause">戻る</button>';
  if(modal==="yaku")return `<div class="modal-layer"><section class="modal subview"><h2>役の得点と組み合わせ</h2>${yakuTable()}<div class="screen-actions">${backButton}</div></section></div>`;
  if(modal==="state")return `<div class="modal-layer"><section class="modal subview"><h2>現状</h2>${stateTable()}<div class="screen-actions">${backButton}</div></section></div>`;
  if(modal==="history")return `<div class="modal-layer"><section class="modal subview"><h2>現在局の履歴</h2>${roundHistory.length?`<ol class="history-list">${roundHistory.map(h=>`<li>${escapeHtml(h)}</li>`).join("")}</ol>`:"<p>まだ手順履歴はありません。</p>"}<div class="screen-actions">${backButton}</div></section></div>`;
  if(modal==="rules")return `<div class="modal-layer"><section class="modal subview"><h2>現在のルール</h2><p>局数：${snapshot?.totalRounds??settings.rounds}局</p><p>こいこい：${snapshot?.koiEnabled?"使用可":"使用不可"}</p><p>得点表：固定</p><div class="screen-actions">${backButton}</div></section></div>`;
  if(modal==="settings")return `<div class="modal-layer"><section class="modal subview"><h2>表示設定</h2><label class="check-row"><input id="match-skip-animations" type="checkbox" ${settings.skipNormalAnimations?"checked":""}>通常演出をスキップ</label><p class="notice">BGM / SE は追加用フックのみです。</p><div class="screen-actions">${backButton}</div></section></div>`;
  return `<div class="modal-layer"><section class="modal"><h2>対局を諦めますか？</h2><p>現在の対局を終了します。途中状態は復元しません。</p><div class="screen-actions"><button class="danger" data-action="confirm-giveup">諦める</button>${backButton}</div></section></div>`;
}

function stateTable(){
  if(!snapshot)return "";const s=snapshot,[myScore,oppScore]=perspectiveScores(s),[myCap,oppCap]=perspectiveCaptured(s);
  return `<table class="data-table"><tbody><tr><th>現在局</th><td>${Math.min(s.roundIndex+1,s.totalRounds)} / ${s.totalRounds}</td></tr><tr><th>累計点</th><td>あなた ${myScore} / 相手 ${oppScore}</td></tr><tr><th>親子</th><td>${s.dealer===playerSeat()?"あなたが親":"相手が親"}</td></tr><tr><th>山札</th><td>${s.deckRemaining}枚</td></tr><tr><th>取得札</th><td>あなた ${myCap.length}枚 / 相手 ${oppCap.length}枚</td></tr><tr><th>成立済役</th><td>${escapeHtml(yakuNames(s.yakuMasks[playerSeat()]))}</td></tr><tr><th>こいこい</th><td>${s.koiUsed?"使用済み":s.koiEnabled?"未使用":"使用不可"}</td></tr></tbody></table>`;
}
function yakuNames(mask:number){const names=YAKU.filter(([bit])=>(mask&bit)!==0).map(([,name])=>name);return names.length?names.join("・"):"なし";}
function specialName(v:number){return v===1?"手四":v===2?"くっつき":"";}

function renderSettlement(final:boolean){
  if(!snapshot)return "";const s=snapshot,[myScore,oppScore]=perspectiveScores(s);const winner=final?s.matchWinner:s.lastRoundWinner;const playerWin=winner===playerSeat(),draw=winner===2||winner===255;const title=final?(draw?"対局終了":playerWin?"勝利":"敗北"):(draw?"流局":playerWin?"あがり":"相手のあがり");
  const ownSpecial=specialName(s.special[playerSeat()]),oppSpecial=specialName(s.special[opponentSeat()]);
  if(final)return `<div class="modal-layer settlement-layer"><section class="settlement-card final"><h2>${title}</h2><div class="settlement-score">${myScore} - ${oppScore}</div><p>${draw?"同点到達順を含む最終判定結果です。":playerWin?"あなたの勝ちです。":"相手の勝ちです。"}</p><div class="screen-actions">${session?.kind==="online"?'<button class="primary" data-postmatch="reconfigure">再戦する</button><button class="secondary" data-postmatch="same">同じ条件でもう一度</button><button class="secondary" data-postmatch="home">ホームに戻る</button>':'<button class="primary" data-action="cpu-reconfigure">再戦する</button><button class="secondary" data-action="cpu-same">同じ条件でもう一度</button><button class="secondary" data-action="finish-home">ホームに戻る</button>'}</div></section></div>`;
  const yaku=winner===0||winner===1?yakuNames(s.yakuMasks[winner]):"なし";
  const basePoints=s.koiUsed&&s.lastRoundPoints>0?Math.floor(s.lastRoundPoints/2):s.lastRoundPoints;
  return `<div class="modal-layer settlement-layer"><section class="settlement-card"><h2>${title}</h2><div class="settlement-score">${s.lastRoundPoints}点</div><div class="settlement-breakdown"><div><span>成立役</span><strong>${escapeHtml(ownSpecial||oppSpecial||yaku)}</strong></div><div><span>基礎点</span><strong>${basePoints}点</strong></div><div><span>こいこい倍率</span><strong>${s.koiUsed?"×2":"×1"}</strong></div><div><span>局得点</span><strong>${s.lastRoundPoints}点</strong></div><div><span>累計点</span><strong>${myScore} - ${oppScore}</strong></div></div><div class="screen-actions">${pendingModeTransition?'<button class="primary" data-action="accept-transition">次へ</button>':'<button class="primary" data-action="next-round">次へ</button>'}</div></section></div>`;
}

function bindGlobalActions(){
  app.querySelectorAll<HTMLElement>("[data-nav]").forEach(el=>el.onclick=()=>push(el.dataset.nav as UiScreen));
  app.querySelectorAll<HTMLElement>("[data-action='back']").forEach(el=>el.onclick=()=>back());
  app.querySelectorAll<HTMLElement>("[data-action='home']").forEach(el=>el.onclick=()=>goHome());
  const mode=app.querySelector<HTMLSelectElement>("#cpu-mode");if(mode)mode.onchange=()=>{settings.mode=mode.value as CpuMode;saveSettings();};
  const rounds=app.querySelector<HTMLSelectElement>("#rounds");if(rounds)rounds.onchange=()=>{settings.rounds=Number(rounds.value);saveSettings();};
  const koi=app.querySelector<HTMLInputElement>("#koi-enabled");if(koi)koi.onchange=()=>{settings.koiEnabled=koi.checked;saveSettings();};
  const skip=app.querySelector<HTMLInputElement>("#skip-animations");if(skip)skip.onchange=()=>{settings.skipNormalAnimations=skip.checked;saveSettings();};
  app.querySelector<HTMLElement>("[data-action='start-cpu']")?.addEventListener("click",()=>void startCpu());
  app.querySelector<HTMLElement>("[data-action='online-create']")?.addEventListener("click",()=>void createOnlineRoom());
  app.querySelector<HTMLElement>("[data-action='online-inspect']")?.addEventListener("click",()=>void inspectOnlineRoom());
  app.querySelector<HTMLElement>("[data-action='online-join']")?.addEventListener("click",()=>void joinOnlineRoom());
  app.querySelector<HTMLElement>("[data-action='online-random']")?.addEventListener("click",()=>void randomOnline());
}

function bindMatchActions(){
  app.querySelectorAll<HTMLButtonElement>("[data-hand-index]").forEach(b=>b.onclick=()=>void sendAction("play",{handIndex:Number(b.dataset.handIndex)}));
  app.querySelectorAll<HTMLButtonElement>("[data-field-index]").forEach(b=>b.onclick=()=>void sendAction("capture",{fieldIndex:Number(b.dataset.fieldIndex)}));
  app.querySelector<HTMLElement>("[data-action='pause']")?.addEventListener("click",()=>{modal="pause";renderMatch();});
  app.querySelectorAll<HTMLElement>("[data-modal]").forEach(el=>el.onclick=()=>{const value=el.dataset.modal;modal=value==="close"?null:value as typeof modal;if(value==="close")renderMatch();else renderMatch();});
  const matchSkip=app.querySelector<HTMLInputElement>("#match-skip-animations");if(matchSkip)matchSkip.onchange=()=>{settings.skipNormalAnimations=matchSkip.checked;saveSettings();};
  app.querySelector<HTMLElement>("[data-action='confirm-giveup']")?.addEventListener("click",()=>void closeMatch(true));
  app.querySelector<HTMLElement>("[data-action='koi-continue']")?.addEventListener("click",()=>void chooseKoi(true));
  app.querySelector<HTMLElement>("[data-action='koi-finish']")?.addEventListener("click",()=>void chooseKoi(false));
  app.querySelector<HTMLElement>("[data-action='next-round']")?.addEventListener("click",()=>void nextRound());
  app.querySelector<HTMLElement>("[data-action='accept-transition']")?.addEventListener("click",()=>void beginImpossibleTransition());
  app.querySelector<HTMLElement>("[data-action='finish-home']")?.addEventListener("click",()=>void closeMatch(true));
  app.querySelector<HTMLElement>("[data-action='cpu-reconfigure']")?.addEventListener("click",()=>void cpuPostmatch("reconfigure"));
  app.querySelector<HTMLElement>("[data-action='cpu-same']")?.addEventListener("click",()=>void cpuPostmatch("same"));
  app.querySelectorAll<HTMLElement>("[data-postmatch]").forEach(el=>el.onclick=()=>void onlinePostmatch(el.dataset.postmatch as "reconfigure"|"same"|"home"));
  app.querySelector<HTMLElement>("[data-action='apply-online-reconfigure']")?.addEventListener("click",()=>void applyOnlineReconfigure());
}

