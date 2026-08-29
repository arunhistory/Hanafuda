"use strict";
function onlineRulesFromUi() { return { rounds: Number(app.querySelector("#online-rounds")?.value ?? 12), koiEnabled: app.querySelector("#online-koi")?.checked ?? true }; }
let inspectedRoom = null;
async function createOnlineRoom() {
    if (busy)
        return;
    busy = true;
    try {
        const rules = onlineRulesFromUi(), r = await api("/api/online/create", { rules });
        if (!r.ok || !r.data?.ok)
            throw new Error(r.data?.code || "ROOM_CREATE_FAILED");
        toast(`ルームコード: ${r.data.roomCode}`);
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
    if (!inspectedRoom || busy)
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
async function randomOnline() {
    if (busy)
        return;
    busy = true;
    try {
        const rules = onlineRulesFromUi();
        let r = await api("/api/online/random", { rules });
        if (!r.ok || !r.data?.ok)
            throw new Error(r.data?.code || "MATCHMAKING_FAILED");
        const ticket = r.data.queueTicket;
        toast("対戦相手を待っています…");
        for (let i = 0; i < 24 && !r.data.matched; i++) {
            await delay(5000);
            r = await api("/api/online/random", { ticket });
            if (!r.ok || !r.data?.ok)
                throw new Error(r.data?.code || "MATCHMAKING_FAILED");
        }
        if (!r.data.matched)
            throw new Error("MATCHMAKING_TIMEOUT");
        await startOnlineSession(r.data.roomCode, r.data.token, r.data.seat === "guest" ? 1 : 0, r.data.rules, null);
    }
    catch (e) {
        toast(e instanceof Error ? e.message : "マッチングに失敗しました");
    }
    finally {
        busy = false;
    }
}
async function startOnlineSession(code, token, seat, rules, initial) {
    const provisional = { kind: "online", roomCode: code, token, seat, version: Number(initial?.version ?? -1), epoch: String(initial?.epoch ?? ""), rules, socket: null };
    session = provisional;
    snapshot = initial?.snapshot ?? null;
    roundHistory = [];
    currentRound = -1;
    stack = ["home", "online", "match"];
    connectOnlineSocket(provisional);
    if (snapshot) {
        renderMatch();
        await animateNewRoundIfNeeded(true);
    }
    else {
        app.innerHTML = `<main class="${screenClass()}"><section class="hero"><h1>待機中</h1><p>ルームコード ${escapeHtml(code)}</p><p>相手の参加と接続を待っています。</p><button class="danger" data-action="wait-cancel">退出</button></section></main>`;
        app.querySelector("[data-action='wait-cancel']").onclick = () => void closeMatch(true);
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
        handleOnlineMessage(msg);
    }
    catch { } };
    ws.onclose = () => { if (session === s)
        toast("通信が切断されました。1分以内に再接続します。"), setTimeout(() => { if (session === s && s.socket?.readyState === WebSocket.CLOSED)
            connectOnlineSocket(s); }, 1800); };
}
function handleOnlineMessage(msg) {
    if (!session || session.kind !== "online")
        return;
    if (msg?.type === "connected" || msg?.type === "state") {
        if (msg.epoch)
            session.epoch = String(msg.epoch);
        if (Number.isSafeInteger(Number(msg.version)))
            session.version = Number(msg.version);
        if (msg.snapshot) {
            const prior = snapshot;
            snapshot = msg.snapshot;
            onlineReconfigureState = "none";
            if (msg.actionEvent)
                recordHistory(msg.actionEvent, msg.actionEvent?.actor === playerSeat() ? "player" : "opponent");
            renderMatch();
            void animateNewRoundIfNeeded(!prior);
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
    else if (msg?.type === "turn_warning")
        toast("持ち時間60秒を超えました。あと30秒です。");
    else if (msg?.type === "timeout") {
        toast("通信タイムアウトのため対局を終了します。");
        void closeMatch(true);
    }
    else if (msg?.type === "disconnect")
        toast("対戦相手の通信が切断されました。復帰を待っています。");
    else if (msg?.type === "closed")
        void closeMatch(true);
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
    const s = session;
    if (!s)
        return;
    if (s.kind === "cpu")
        navigator.sendBeacon?.(`${API_BASE}/api/cpu/close`, new Blob([JSON.stringify({ sessionId: s.sessionId, token: s.token })], { type: "text/plain;charset=UTF-8" }));
    else
        navigator.sendBeacon?.(`${API_BASE}/api/online/close`, new Blob([JSON.stringify({ roomCode: s.roomCode, token: s.token, reason: "pagehide" })], { type: "text/plain;charset=UTF-8" }));
});
void render();
