"use strict";
function onlineRulesFromUi() { return { rounds: Number(app.querySelector("#online-rounds")?.value ?? 12), koiEnabled: app.querySelector("#online-koi")?.checked ?? true }; }
let inspectedRoom = null;
let matchmakingSocket = null;
function setMatchmakingUi(active) {
    const random = app.querySelector("[data-action='online-random']");
    if (random) {
        random.textContent = active ? "マッチング中止" : "ランダム対戦";
        random.classList.toggle("danger", active);
        random.classList.toggle("secondary", !active);
    }
    app.querySelectorAll("#online-rounds,#online-koi,#room-code,[data-action='online-create'],[data-action='online-inspect'],[data-action='online-join']").forEach(el => el.disabled = active || (el.dataset.action === "online-join" && !inspectedRoom));
}
function cancelRandomMatch(renderAfter = true) {
    const ws = matchmakingSocket;
    matchmakingSocket = null;
    busy = false;
    if (ws) {
        try {
            if (ws.readyState === WebSocket.OPEN)
                ws.send(JSON.stringify({ type: "cancel" }));
        }
        catch { }
        try {
            ws.close(1000, "cancelled");
        }
        catch { }
    }
    if (renderAfter && currentScreen() === "online")
        void render();
}
function inviteUrlForRoom(code) {
    const url = new URL(location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set("room", code);
    return url.toString();
}
function invitedRoomFromUrl() {
    try {
        const code = (new URL(location.href).searchParams.get("room") ?? "").trim().toUpperCase();
        return /^[A-Z2-9]{6}$/.test(code) ? code : null;
    }
    catch {
        return null;
    }
}
function clearInvitedRoomFromUrl() {
    const url = new URL(location.href);
    if (!url.searchParams.has("room"))
        return;
    url.searchParams.delete("room");
    history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}
async function copyInviteUrl(code) {
    const value = inviteUrlForRoom(code);
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(value);
            toast("招待リンクをコピーしました");
            return;
        }
    }
    catch { }
    const input = app.querySelector("#invite-url");
    if (input) {
        input.focus();
        input.select();
        input.setSelectionRange(0, input.value.length);
        try {
            if (document.execCommand("copy")) {
                toast("招待リンクをコピーしました");
                return;
            }
        }
        catch { }
    }
    toast("コピーできませんでした。招待リンク欄からコピーしてください。");
}
async function createOnlineRoom() {
    if (busy)
        return;
    busy = true;
    try {
        const rules = onlineRulesFromUi(), r = await api("/api/online/create", { rules });
        if (!r.ok || !r.data?.ok)
            throw new Error(r.data?.code || "ROOM_CREATE_FAILED");
        await startOnlineSession(r.data.roomCode, r.data.hostToken, 0, rules, null);
    }
    catch (e) {
        toast(e instanceof Error ? e.message : "部屋作成に失敗しました");
    }
    finally {
        busy = false;
    }
}
async function inspectOnlineRoom() {
    if (matchmakingSocket)
        return;
    const input = app.querySelector("#room-code");
    if (!input)
        return;
    const code = input.value.trim().toUpperCase();
    try {
        const response = await fetch(`${API_BASE}/api/online/inspect?room=${encodeURIComponent(code)}`, { cache: "no-store" }), data = await response.json().catch(() => null);
        if (!response.ok || !data?.ok)
            throw new Error(data?.code || "ROOM_INSPECT_FAILED");
        inspectedRoom = { code, rules: data.rules };
        const box = app.querySelector("#room-inspect");
        if (box)
            box.textContent = `${data.rules.rounds}局 / こいこい ${data.rules.koiEnabled ? "あり" : "なし"}`;
        const join = app.querySelector("[data-action='online-join']");
        if (join)
            join.disabled = false;
    }
    catch (e) {
        inspectedRoom = null;
        toast(e instanceof Error ? e.message : "確認に失敗しました");
    }
}
async function joinOnlineRoom() {
    if (!inspectedRoom || busy || matchmakingSocket)
        return;
    busy = true;
    try {
        const r = await api("/api/online/join", { roomCode: inspectedRoom.code });
        if (!r.ok || !r.data?.ok)
            throw new Error(r.data?.code || "ROOM_JOIN_FAILED");
        await startOnlineSession(inspectedRoom.code, r.data.guestToken, 1, r.data.rules, r.data);
    }
    catch (e) {
        toast(e instanceof Error ? e.message : "参加できません");
    }
    finally {
        busy = false;
    }
}
async function joinInvitedOnlineRoom(code) {
    stack = ["home", "online"];
    app.innerHTML = `<main class="${screenClass("online-wait-screen")}"><section class="hero online-wait-hero"><h1>オンライン対戦</h1><p>招待された部屋を確認しています…</p></section></main>`;
    const inspect = await fetch(`${API_BASE}/api/online/inspect?room=${encodeURIComponent(code)}`, { cache: "no-store" }), info = await inspect.json().catch(() => null);
    if (!inspect.ok || !info?.ok)
        throw new Error(info?.code || "ROOM_INSPECT_FAILED");
    const joined = await api("/api/online/join", { roomCode: code });
    if (!joined.ok || !joined.data?.ok)
        throw new Error(joined.data?.code || "ROOM_JOIN_FAILED");
    settings.rounds = Number(joined.data.rules?.rounds ?? info.rules.rounds);
    settings.koiEnabled = Boolean(joined.data.rules?.koiEnabled ?? info.rules.koiEnabled);
    saveSettings();
    clearInvitedRoomFromUrl();
    await startOnlineSession(code, joined.data.guestToken, 1, joined.data.rules, joined.data);
}
function randomOnline() {
    if (matchmakingSocket) {
        cancelRandomMatch();
        return;
    }
    if (busy)
        return;
    const rules = onlineRulesFromUi();
    settings.rounds = rules.rounds;
    settings.koiEnabled = rules.koiEnabled;
    saveSettings();
    busy = true;
    const url = new URL(API_BASE.replace(/^http/, "ws") + "/api/online/random/connect");
    url.searchParams.set("rounds", String(rules.rounds));
    url.searchParams.set("koiEnabled", String(rules.koiEnabled));
    const ws = new WebSocket(url);
    matchmakingSocket = ws;
    let matched = false;
    setMatchmakingUi(true);
    const cancelOnNavigate = () => cancelRandomMatch(false);
    app.querySelector("[data-action='back']")?.addEventListener("click", cancelOnNavigate, { capture: true, once: true });
    app.querySelector("[data-action='home']")?.addEventListener("click", cancelOnNavigate, { capture: true, once: true });
    ws.onopen = () => toast("対戦相手を待っています…");
    ws.onmessage = event => {
        let msg;
        try {
            msg = JSON.parse(String(event.data));
        }
        catch {
            return;
        }
        if (msg?.type === "queued")
            return;
        if (msg?.type === "timeout") {
            toast("マッチング時間を超えました。");
            cancelRandomMatch();
            return;
        }
        if (msg?.type === "error") {
            toast(msg.code || "マッチングに失敗しました");
            cancelRandomMatch();
            return;
        }
        if (msg?.type !== "matched" || matchmakingSocket !== ws)
            return;
        matched = true;
        matchmakingSocket = null;
        busy = false;
        try {
            ws.close(1000, "matched");
        }
        catch { }
        const seat = msg.seat === "guest" ? 1 : 0;
        const matchRules = msg.rules;
        void startOnlineSession(String(msg.roomCode), String(msg.token), seat, matchRules, null);
    };
    ws.onerror = () => { if (matchmakingSocket === ws)
        toast("マッチング通信でエラーが発生しました。"); };
    ws.onclose = () => { if (matchmakingSocket !== ws)
        return; matchmakingSocket = null; busy = false; if (!matched)
        toast("マッチングを終了しました。"); if (currentScreen() === "online")
        void render(); };
}
function waitingRoomHtml(code, rules) {
    const invite = inviteUrlForRoom(code);
    return `<main class="${screenClass("online-wait-screen")}"><section class="hero online-wait-hero"><h1>対戦相手を待っています</h1><div class="room-code-panel" aria-label="作成したルームコード"><span class="room-code-label">ルームコード</span><strong class="room-code-value">${escapeHtml(code)}</strong><span class="room-code-help">このコードを相手に伝えてください</span></div><div class="invite-link-panel"><label for="invite-url">招待リンク</label><div class="invite-link-controls"><input id="invite-url" readonly value="${escapeHtml(invite)}" aria-label="招待リンク"><button type="button" class="secondary" data-action="copy-invite">招待リンクをコピー</button></div></div><p class="online-wait-rules">${rules.rounds}局 / こいこい ${rules.koiEnabled ? "あり" : "なし"}</p><p>相手が参加するまで、この画面にルームコードと招待リンクを表示し続けます。</p><button class="danger" data-action="wait-cancel">退出</button></section></main>`;
}
async function startOnlineSession(code, token, seat, rules, initial) {
    stopOnlineWarning();
    const provisional = { kind: "online", roomCode: code, token, seat, version: Number(initial?.version ?? -1), epoch: String(initial?.epoch ?? ""), rules, socket: null };
    session = provisional;
    snapshot = initial?.snapshot ?? null;
    roundHistory = [];
    currentRound = -1;
    stack = ["home", "online", "match"];
    connectOnlineSocket(provisional);
    if (snapshot) {
        emitAudioHook("match-start", { mode: "normal" });
        renderMatch();
        await animateNewRoundIfNeeded(true);
    }
    else {
        app.innerHTML = waitingRoomHtml(code, rules);
        app.querySelector("[data-action='wait-cancel']").onclick = () => void closeMatch(true);
        app.querySelector("[data-action='copy-invite']").onclick = () => void copyInviteUrl(code);
    }
}
function connectOnlineSocket(s) {
    const url = new URL(API_BASE.replace(/^http/, "ws") + "/api/online/connect");
    url.searchParams.set("room", s.roomCode);
    url.searchParams.set("token", s.token);
    const ws = new WebSocket(url);
    s.socket = ws;
    ws.onmessage = event => { try {
        const msg = JSON.parse(String(event.data));
        void handleOnlineMessage(msg);
    }
    catch { } };
    ws.onclose = () => { if (session === s)
        toast("通信が切断されました。1分以内に再接続します。"), setTimeout(() => { if (session === s && s.socket?.readyState === WebSocket.CLOSED)
            connectOnlineSocket(s); }, 1800); };
}
async function handleOnlineMessage(msg) {
    if (!session || session.kind !== "online")
        return;
    if (msg?.type === "connected" || msg?.type === "state") {
        stopOnlineWarning();
        const prior = snapshot, priorVersion = session.version, priorEpoch = session.epoch, incomingVersion = Number(msg.version), incomingEpoch = msg.epoch ? String(msg.epoch) : priorEpoch;
        const epochChanged = !!priorEpoch && !!incomingEpoch && incomingEpoch !== priorEpoch;
        const isNewAction = !!msg.actionEvent && !epochChanged && (!Number.isSafeInteger(incomingVersion) || incomingVersion > priorVersion);
        if (msg.epoch)
            session.epoch = incomingEpoch;
        if (Number.isSafeInteger(incomingVersion))
            session.version = incomingVersion;
        if (epochChanged) {
            roundHistory = [];
            currentRound = -1;
        }
        if (msg.snapshot) {
            onlineReconfigureState = "none";
            if (!prior)
                emitAudioHook("match-start", { mode: "normal" });
            if (isNewAction)
                await acceptSnapshot(msg.snapshot, msg.actionEvent, msg.actionEvent?.actor === playerSeat() ? "player" : "opponent");
            else {
                snapshot = msg.snapshot;
                renderMatch();
            }
            await animateNewRoundIfNeeded(!prior || epochChanged);
        }
    }
    else if (msg?.type === "postmatch_choice") {
        if (msg.choice === "reconfigure") {
            onlineReconfigureState = session.seat === 0 ? "host" : "guest";
            renderMatch();
        }
        else if (msg.choice === "home")
            void closeMatch(true);
    }
    else if (msg?.type === "rules_changed") {
        if (msg.rules)
            session.rules = msg.rules;
    }
    else if (msg?.type === "turn_warning") {
        startOnlineWarning();
        toast("持ち時間60秒を超えました。あと30秒です。");
    }
    else if (msg?.type === "timeout") {
        stopOnlineWarning();
        toast("通信タイムアウトのため対局を終了します。");
        void closeMatch(true);
    }
    else if (msg?.type === "disconnect") {
        stopOnlineWarning();
        toast("対戦相手の通信が切断されました。復帰を待っています。");
    }
    else if (msg?.type === "closed") {
        stopOnlineWarning();
        void closeMatch(true);
    }
}
async function onlinePostmatch(choice) {
    if (!session || session.kind !== "online")
        return;
    const s = session;
    const r = await api("/api/online/postmatch", { roomCode: s.roomCode, token: s.token, epoch: s.epoch, version: s.version, choice });
    if (!r.ok || !r.data?.ok) {
        toast(r.data?.code || "終了後処理に失敗しました");
        return;
    }
    const lockedChoice = String(r.data.choice ?? choice);
    if (r.data.locked && lockedChoice !== choice)
        toast(`先着の選択「${lockedChoice}」が適用されました`);
    if (lockedChoice === "home") {
        stopOnlineWarning();
        await closeMatch(true);
        return;
    }
    if (lockedChoice === "reconfigure") {
        onlineReconfigureState = s.seat === 0 ? "host" : "guest";
        renderMatch();
        return;
    }
    if (lockedChoice === "same" && r.data.snapshot) {
        const prior = snapshot;
        s.epoch = String(r.data.epoch ?? s.epoch);
        s.version = Number(r.data.version ?? s.version);
        snapshot = r.data.snapshot;
        onlineReconfigureState = "none";
        roundHistory = [];
        currentRound = -1;
        renderMatch();
        await animateNewRoundIfNeeded(!prior || prior.phase === 6);
    }
}
async function applyOnlineReconfigure() {
    if (!session || session.kind !== "online" || session.seat !== 0 || onlineReconfigureState !== "host")
        return;
    const rounds = Number(app.querySelector("#reconfig-rounds")?.value ?? session.rules.rounds), koiEnabled = app.querySelector("#reconfig-koi")?.checked ?? session.rules.koiEnabled;
    const r = await api("/api/online/reconfigure", { roomCode: session.roomCode, token: session.token, epoch: session.epoch, rules: { rounds, koiEnabled } });
    if (!r.ok || !r.data?.ok) {
        toast(r.data?.code || "再設定に失敗しました");
        return;
    }
    session.rules = r.data.rules;
    session.epoch = String(r.data.epoch);
    session.version = Number(r.data.version);
    snapshot = r.data.snapshot;
    onlineReconfigureState = "none";
    roundHistory = [];
    currentRound = -1;
    renderMatch();
    await animateNewRoundIfNeeded(true);
}
window.addEventListener("pagehide", () => {
    stopOnlineWarning();
    const waiting = matchmakingSocket;
    matchmakingSocket = null;
    if (waiting) {
        try {
            if (waiting.readyState === WebSocket.OPEN)
                waiting.send(JSON.stringify({ type: "cancel" }));
        }
        catch { }
        try {
            waiting.close(1000, "pagehide");
        }
        catch { }
    }
    const s = session;
    if (!s)
        return;
    if (s.kind === "cpu")
        navigator.sendBeacon?.(`${API_BASE}/api/cpu/close`, new Blob([JSON.stringify({ sessionId: s.sessionId, token: s.token })], { type: "text/plain;charset=UTF-8" }));
    else
        navigator.sendBeacon?.(`${API_BASE}/api/online/close`, new Blob([JSON.stringify({ roomCode: s.roomCode, token: s.token, reason: "pagehide" })], { type: "text/plain;charset=UTF-8" }));
});
async function startOnlineUi() {
    await render();
    const invited = invitedRoomFromUrl();
    if (!invited)
        return;
    try {
        await joinInvitedOnlineRoom(invited);
    }
    catch (e) {
        stack = ["home", "online"];
        await render();
        const input = app.querySelector("#room-code");
        if (input)
            input.value = invited;
        toast(e instanceof Error ? e.message : "招待リンクから接続できませんでした");
    }
}
void startOnlineUi();
