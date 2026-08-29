import { JSON_HEADERS, json, randomToken, bodyJson, validOpaqueToken, roomCode, parseRuleSet, ruleKey, validRoomCode } from "./gateway-common.js";
export class HanafudaDirectory {
    state;
    env;
    constructor(state, env) { this.state = state; this.env = env; }
    async makeRoom(waitingTicket, currentTicket, rules) {
        for (let attempt = 0; attempt < 8; attempt++) {
            const code = roomCode(), hostToken = randomToken(), guestToken = randomToken(), stub = this.env.ROOMS.get(this.env.ROOMS.idFromName(code));
            const create = await stub.fetch("https://room/create", { method: "POST", body: JSON.stringify({ op: "create", hostToken, rules }) });
            if (create.status === 409)
                continue;
            if (!create.ok)
                return null;
            const join = await stub.fetch("https://room/join", { method: "POST", body: JSON.stringify({ op: "join", guestToken }) });
            if (!join.ok)
                return null;
            const expires = Date.now() + 120_000;
            await this.state.storage.put(`match:${waitingTicket}`, { roomCode: code, token: hostToken, seat: "host", rules, expires });
            return { roomCode: code, token: guestToken, seat: "guest", rules, expires };
        }
        return null;
    }
    async fetch(req) {
        if (req.method !== "POST")
            return json({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405);
        let body;
        try {
            body = await bodyJson(req);
        }
        catch {
            return json({ ok: false, code: "INVALID_JSON" }, 400);
        }
        const op = String(body?.op ?? ""), ticket = String(body?.ticket ?? "");
        if (!validOpaqueToken(ticket))
            return json({ ok: false, code: "INVALID_TICKET" }, 400);
        if (op === "enqueue") {
            const rules = parseRuleSet(body?.rules);
            if (!rules)
                return json({ ok: false, code: "INVALID_RULESET" }, 400);
            const key = ruleKey(rules), waitKey = `waiting:${key}`, now = Date.now();
            const waiting = await this.state.storage.get(waitKey);
            if (waiting && Number(waiting.expires) > now && waiting.ticket !== ticket) {
                const result = await this.makeRoom(waiting.ticket, ticket, rules);
                if (!result)
                    return json({ ok: false, code: "MATCH_CREATE_FAILED" }, 503);
                await this.state.storage.delete(waitKey);
                await this.state.storage.delete(`ticketrule:${waiting.ticket}`);
                return json({ ok: true, matched: true, ...result });
            }
            await this.state.storage.put(waitKey, { ticket, expires: now + 120_000 });
            await this.state.storage.put(`ticketrule:${ticket}`, key);
            return json({ ok: true, matched: false, rules });
        }
        if (op === "poll") {
            const match = await this.state.storage.get(`match:${ticket}`);
            if (!match)
                return json({ ok: true, matched: false });
            await this.state.storage.delete(`match:${ticket}`);
            await this.state.storage.delete(`ticketrule:${ticket}`);
            if (Number(match.expires) <= Date.now())
                return json({ ok: true, matched: false });
            return json({ ok: true, matched: true, roomCode: match.roomCode, token: match.token, seat: match.seat, rules: match.rules });
        }
        if (op === "cancel") {
            const key = String(await this.state.storage.get(`ticketrule:${ticket}`) ?? "");
            if (key) {
                const waitKey = `waiting:${key}`, waiting = await this.state.storage.get(waitKey);
                if (waiting?.ticket === ticket)
                    await this.state.storage.delete(waitKey);
            }
            await this.state.storage.delete(`ticketrule:${ticket}`);
            await this.state.storage.delete(`match:${ticket}`);
            return json({ ok: true });
        }
        return json({ ok: false, code: "UNKNOWN_OPERATION" }, 404);
    }
}
export async function routeOnlineV3(req, env, url) {
    if (url.pathname === "/api/online/inspect" && req.method === "GET") {
        const code = String(url.searchParams.get("room") ?? "").toUpperCase();
        if (!validRoomCode(code))
            return json({ ok: false, code: "INVALID_ROOM_CODE" }, 400);
        return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch("https://room/inspect", { method: "POST", body: JSON.stringify({ op: "inspect" }) });
    }
    if (url.pathname === "/api/online/random" && req.method === "POST") {
        let body;
        try {
            body = await bodyJson(req);
        }
        catch {
            return json({ ok: false, code: "INVALID_JSON" }, 400);
        }
        const supplied = String(body?.ticket ?? ""), ticket = supplied || randomToken(), op = supplied ? "poll" : "enqueue";
        if (supplied && !validOpaqueToken(supplied))
            return json({ ok: false, code: "INVALID_TICKET" }, 400);
        const payload = { op, ticket };
        if (op === "enqueue") {
            const rules = parseRuleSet(body?.rules);
            if (!rules)
                return json({ ok: false, code: "INVALID_RULESET" }, 400);
            payload.rules = rules;
        }
        const response = await env.DIRECTORY.get(env.DIRECTORY.idFromName("global")).fetch("https://directory/", { method: "POST", body: JSON.stringify(payload) }), data = await response.json().catch(() => null);
        return json({ ...data, queueTicket: ticket }, response.status);
    }
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
