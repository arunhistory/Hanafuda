import { JSON_HEADERS, json, randomToken, bodyJson, validOpaqueToken, roomCode, parseRuleSet, ruleKey, validRoomCode } from "./gateway-common.js";
const QUEUE_TTL = 120_000;
export class HanafudaDirectory {
    state;
    env;
    sockets;
    constructor(state, env) { this.state = state; this.env = env; this.sockets = new Map(); }
    async scheduleCleanup(at) {
        const target = Math.max(Date.now() + 1, Number(at ?? Date.now() + QUEUE_TTL));
        const existing = Number(await this.state.storage.getAlarm() ?? 0);
        if (!existing || target < existing)
            await this.state.storage.setAlarm(target);
    }
    async createRoom(rules) {
        for (let attempt = 0; attempt < 8; attempt++) {
            const code = roomCode(), hostToken = randomToken(), guestToken = randomToken(), stub = this.env.ROOMS.get(this.env.ROOMS.idFromName(code));
            const create = await stub.fetch("https://room/create", { method: "POST", body: JSON.stringify({ op: "create", hostToken, rules }) });
            if (create.status === 409)
                continue;
            if (!create.ok)
                return null;
            const join = await stub.fetch("https://room/join", { method: "POST", body: JSON.stringify({ op: "join", guestToken }) });
            if (!join.ok) {
                await stub.fetch("https://room/op", { method: "POST", body: JSON.stringify({ op: "close", token: hostToken, reason: "matchmaking_join_failed" }) }).catch(() => null);
                return null;
            }
            return { roomCode: code, hostToken, guestToken, rules };
        }
        return null;
    }
    send(socket, value) {
        try {
            socket.send(JSON.stringify(value));
            return true;
        }
        catch {
            return false;
        }
    }
    async dropWaiting(ticket, waitKey, socket, closeCode, closeReason) {
        if (this.sockets.get(ticket) === socket)
            this.sockets.delete(ticket);
        const waiting = await this.state.storage.get(waitKey);
        if (waiting?.ticket === ticket)
            await this.state.storage.delete(waitKey);
        if (closeCode) {
            try {
                socket.close(closeCode, closeReason ?? "closed");
            }
            catch { }
        }
        await this.rescheduleFromStorage();
    }
    async rescheduleFromStorage() {
        const items = await this.state.storage.list({ prefix: "waiting:", limit: 1000 });
        let next = 0;
        const now = Date.now();
        for (const [, value] of items) {
            const expires = Number(value?.expires ?? 0);
            if (expires > now && (next === 0 || expires < next))
                next = expires;
        }
        if (next > 0)
            await this.state.storage.setAlarm(Math.max(Date.now() + 1, next));
        else
            await this.state.storage.deleteAlarm();
    }
    parseRulesFromUrl(url) {
        const rounds = Number(url.searchParams.get("rounds"));
        const rawKoi = url.searchParams.get("koiEnabled");
        if (rawKoi !== "true" && rawKoi !== "false")
            return null;
        return parseRuleSet({ rounds, koiEnabled: rawKoi === "true" });
    }
    async connect(req, url) {
        if (req.headers.get("Upgrade") !== "websocket")
            return json({ ok: false, code: "UPGRADE_REQUIRED" }, 426);
        const rules = this.parseRulesFromUrl(url);
        if (!rules)
            return json({ ok: false, code: "INVALID_RULESET" }, 400);
        const pair = new WebSocketPair(), client = pair[0], server = pair[1], ticket = randomToken(), key = ruleKey(rules), waitKey = `waiting:${key}`;
        server.accept();
        this.sockets.set(ticket, server);
        server.addEventListener("message", (event) => {
            let message;
            try {
                message = JSON.parse(String(event.data));
            }
            catch {
                return;
            }
            if (message?.type === "ping")
                this.send(server, { type: "pong", t: Date.now() });
            if (message?.type === "cancel")
                void this.dropWaiting(ticket, waitKey, server, 1000, "cancelled");
        });
        server.addEventListener("close", () => void this.dropWaiting(ticket, waitKey, server));
        server.addEventListener("error", () => void this.dropWaiting(ticket, waitKey, server));
        const now = Date.now();
        const waiting = await this.state.storage.get(waitKey);
        if (waiting && waiting.expires > now && waiting.ticket !== ticket) {
            const peer = this.sockets.get(waiting.ticket);
            if (peer) {
                const room = await this.createRoom(rules);
                if (!room) {
                    this.send(peer, { type: "error", code: "MATCH_CREATE_FAILED" });
                    this.send(server, { type: "error", code: "MATCH_CREATE_FAILED" });
                    await this.dropWaiting(waiting.ticket, waitKey, peer, 1011, "match_create_failed");
                    await this.dropWaiting(ticket, waitKey, server, 1011, "match_create_failed");
                    return new Response(null, { status: 101, webSocket: client });
                }
                await this.state.storage.delete(waitKey);
                this.sockets.delete(waiting.ticket);
                this.sockets.delete(ticket);
                const hostOk = this.send(peer, { type: "matched", roomCode: room.roomCode, token: room.hostToken, seat: "host", rules: room.rules });
                const guestOk = this.send(server, { type: "matched", roomCode: room.roomCode, token: room.guestToken, seat: "guest", rules: room.rules });
                if (!hostOk || !guestOk) {
                    const stub = this.env.ROOMS.get(this.env.ROOMS.idFromName(room.roomCode));
                    await stub.fetch("https://room/op", { method: "POST", body: JSON.stringify({ op: "close", token: room.hostToken, reason: "matchmaking_peer_lost" }) }).catch(() => null);
                    if (hostOk)
                        this.send(peer, { type: "error", code: "MATCH_PEER_LOST" });
                    if (guestOk)
                        this.send(server, { type: "error", code: "MATCH_PEER_LOST" });
                    try {
                        peer.close(1011, "peer_lost");
                    }
                    catch { }
                    try {
                        server.close(1011, "peer_lost");
                    }
                    catch { }
                }
                else {
                    try {
                        peer.close(1000, "matched");
                    }
                    catch { }
                    try {
                        server.close(1000, "matched");
                    }
                    catch { }
                }
                await this.rescheduleFromStorage();
                return new Response(null, { status: 101, webSocket: client });
            }
            await this.state.storage.delete(waitKey);
        }
        const expires = now + QUEUE_TTL;
        await this.state.storage.put(waitKey, { ticket, expires });
        await this.scheduleCleanup(expires);
        this.send(server, { type: "queued", ticket, rules, expires });
        return new Response(null, { status: 101, webSocket: client });
    }
    async fetch(req) {
        const url = new URL(req.url);
        if (req.method === "GET" && url.pathname.endsWith("/connect"))
            return this.connect(req, url);
        return json({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405);
    }
    async alarm() {
        const now = Date.now();
        let next = 0;
        const items = await this.state.storage.list({ prefix: "waiting:", limit: 1000 });
        for (const [key, value] of items) {
            const ticket = String(value?.ticket ?? ""), expires = Number(value?.expires ?? 0);
            if (expires > 0 && expires <= now) {
                await this.state.storage.delete(key);
                const socket = this.sockets.get(ticket);
                if (socket) {
                    this.sockets.delete(ticket);
                    this.send(socket, { type: "timeout", code: "MATCHMAKING_TIMEOUT" });
                    try {
                        socket.close(4000, "matchmaking_timeout");
                    }
                    catch { }
                }
            }
            else if (expires > now && (next === 0 || expires < next))
                next = expires;
        }
        if (next > 0)
            await this.state.storage.setAlarm(Math.max(Date.now() + 1, next));
        else
            await this.state.storage.deleteAlarm();
    }
}
export async function routeOnlineV3(req, env, url) {
    if (url.pathname === "/api/online/inspect" && req.method === "GET") {
        const code = String(url.searchParams.get("room") ?? "").toUpperCase();
        if (!validRoomCode(code))
            return json({ ok: false, code: "INVALID_ROOM_CODE" }, 400);
        return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch("https://room/inspect", { method: "POST", body: JSON.stringify({ op: "inspect" }) });
    }
    if (url.pathname === "/api/online/random/connect") {
        if (req.method !== "GET")
            return json({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405);
        const target = new URL(req.url);
        target.pathname = "/connect";
        return env.DIRECTORY.get(env.DIRECTORY.idFromName("global")).fetch(new Request(target.toString(), req));
    }
    if (url.pathname === "/api/online/random")
        return json({ ok: false, code: "MATCHMAKING_WEBSOCKET_REQUIRED" }, 410);
    if (!["/api/online/action", "/api/online/status", "/api/online/postmatch", "/api/online/reconfigure", "/api/online/close"].includes(url.pathname))
        return null;
    if (req.method !== "POST")
        return json({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405);
    let body;
    try {
        body = await bodyJson(req);
    }
    catch {
        return json({ ok: false, code: "INVALID_JSON" }, 400);
    }
    const code = String(body?.roomCode ?? "").toUpperCase(), token = String(body?.token ?? "");
    if (!validRoomCode(code) || !validOpaqueToken(token))
        return json({ ok: false, code: "INVALID_SESSION" }, 400);
    const op = url.pathname.endsWith("/action") ? "action" : url.pathname.endsWith("/status") ? "status" : url.pathname.endsWith("/postmatch") ? "postmatch" : url.pathname.endsWith("/reconfigure") ? "reconfigure" : "close";
    const response = await env.ROOMS.get(env.ROOMS.idFromName(code)).fetch("https://room/op", { method: "POST", body: JSON.stringify({ ...body, op, token }) });
    const text = await response.text();
    return new Response(text, { status: response.status, headers: JSON_HEADERS });
}
