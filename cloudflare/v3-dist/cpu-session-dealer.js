import { HanafudaCpuSession as BaseCpuSession, routeCpu as baseRouteCpu } from "./cpu-session.js";
import { JSON_HEADERS, json, randomToken, sha256Hex, bodyJson, safeCpuMode, modeCode, parseRounds, validOpaqueToken, engineCall } from "./gateway-common.js";
function parseFirstDealer(v) { const n = Number(v); return n === -1 || n === 0 || n === 1 ? n : null; }
export class HanafudaCpuSessionDealer extends BaseCpuSession {
    async init(body) {
        if (await this.state.storage.get("initialized"))
            return json({ ok: false, code: "ALREADY_INITIALIZED" }, 409);
        const token = String(body?.token ?? ""), mode = safeCpuMode(String(body?.mode ?? "")), rounds = parseRounds(body?.rounds), koiEnabled = body?.koiEnabled, firstDealer = parseFirstDealer(body?.firstDealer ?? -1);
        const modeSessionId = String(body?.modeSessionId ?? ""), modeSessionToken = String(body?.modeSessionToken ?? "");
        if (!validOpaqueToken(token) || !mode || rounds === null || typeof koiEnabled !== "boolean" || firstDealer === null)
            return json({ ok: false, code: "INVALID_INIT" }, 400);
        let developer = false;
        if (mode !== "impossible") {
            if (!validOpaqueToken(modeSessionId) || !validOpaqueToken(modeSessionToken))
                return json({ ok: false, code: "INVALID_MODE_SESSION" }, 400);
            let modeId;
            try {
                modeId = this.env.MODE_SESSIONS.idFromString(modeSessionId);
            }
            catch {
                return json({ ok: false, code: "INVALID_MODE_SESSION" }, 400);
            }
            const modeStub = this.env.MODE_SESSIONS.get(modeId);
            const modeResponse = await modeStub.fetch("https://mode/op", { method: "POST", body: JSON.stringify({ op: "status", token: modeSessionToken }) });
            const modeData = await modeResponse.json().catch(() => null);
            if (!modeResponse.ok || modeData?.mode !== mode || Number(modeData?.rounds) !== rounds || modeData?.phase !== "active")
                return json({ ok: false, code: "MODE_SESSION_MISMATCH" }, 409);
            developer = modeData?.developer === true;
        }
        const created = await engineCall(this.env, { op: "create_internal", rounds, cpuProfile: modeCode(mode), firstDealer, koiEnabled });
        if (!created.ok || !created.data?.ok || !created.data?.gameId)
            return json({ ok: false, code: "ENGINE_CREATE_FAILED" }, 502);
        await this.state.storage.put({ initialized: true, closed: false, ready: false, tokenHash: await sha256Hex(token), mode, rounds, koiEnabled, firstDealer, gameId: created.data.gameId, version: Number(created.data.version), modeSessionId: mode === "impossible" ? null : modeSessionId, modeSessionToken: mode === "impossible" ? null : modeSessionToken, developer, pendingTransition: false, challenge: false, challengeTestOnly: false, unlockGranted: false, createdAt: Date.now() });
        const events = [{ actor: "system", snapshot: created.data.snapshot, version: Number(created.data.version), actionEvent: null }];
        let modeTransition = null;
        if (Number(created.data.snapshot?.phase) === 5 && mode !== "impossible") {
            const ms = await this.modeSession();
            const check = ms ? await engineCall(this.env, { op: "mode_check", gameId: String(created.data.gameId), seat: 0, modeSession: ms }) : null;
            if (check?.ok && check.data?.ok && check.data?.modeTransition?.transition === "impossible") {
                modeTransition = check.data.modeTransition;
                await this.state.storage.put({ pendingTransition: true, forcedRounds: Number(modeTransition.forcedRounds ?? 6), pendingModeTransition: modeTransition });
            }
        }
        const finalEvent = events[events.length - 1];
        const unlockGranted = await this.maybeGrantUnlock(finalEvent.snapshot);
        return json({ ok: true, version: Number(finalEvent.version), snapshot: finalEvent.snapshot, events, modeTransition, unlockGranted, mode, rounds, koiEnabled, firstDealer, ready: false });
    }
}
export async function routeCpuDealer(req, env, url) {
    if (url.pathname !== "/api/cpu/start")
        return baseRouteCpu(req, env, url);
    if (req.method !== "POST")
        return json({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405);
    let body;
    try {
        body = await bodyJson(req);
    }
    catch (e) {
        return json({ ok: false, code: e?.message === "REQUEST_TOO_LARGE" ? "REQUEST_TOO_LARGE" : "INVALID_JSON" }, 400);
    }
    const mode = safeCpuMode(String(body?.mode ?? "")), rounds = parseRounds(body?.rounds), koiEnabled = body?.koiEnabled, firstDealer = parseFirstDealer(body?.firstDealer ?? -1);
    if (!mode || rounds === null || typeof koiEnabled !== "boolean" || firstDealer === null)
        return json({ ok: false, code: "INVALID_RULESET" }, 400);
    const directImpossible = mode === "impossible";
    if (directImpossible && (body?.unlocked !== true || req.headers.get("Origin") !== env.APP_ORIGIN))
        return json({ ok: false, code: "MODE_LOCKED" }, 403);
    const modeSessionId = String(body?.modeSessionId ?? ""), modeSessionToken = String(body?.modeSessionToken ?? "");
    if (!directImpossible && (!validOpaqueToken(modeSessionId) || !validOpaqueToken(modeSessionToken)))
        return json({ ok: false, code: "INVALID_MODE_SESSION" }, 400);
    const id = env.CPU_SESSIONS.newUniqueId(), token = randomToken(), stub = env.CPU_SESSIONS.get(id);
    const response = await stub.fetch("https://cpu/init", { method: "POST", body: JSON.stringify({ op: "init", token, mode, rounds, koiEnabled, firstDealer, modeSessionId: directImpossible ? null : modeSessionId, modeSessionToken: directImpossible ? null : modeSessionToken }) });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok)
        return json(data ?? { ok: false, code: "CPU_SESSION_INIT_FAILED" }, response.status || 502);
    return json({ ok: true, sessionId: id.toString(), token, version: data.version, snapshot: data.snapshot, events: data.events ?? [], modeTransition: data.modeTransition ?? null, unlockGranted: data.unlockGranted === true, mode, rounds, koiEnabled, firstDealer, ready: false });
}
