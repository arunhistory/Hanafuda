// Cloudflare gateway extension. Existing mode behavior remains in worker-v2.
// TypeScript source; root JS modules are generated build artifacts.
// @ts-ignore - deployment uploads worker-v2.js beside generated worker-v3.js.
import baseWorker, { HanafudaModeSession as BaseModeSession } from "./worker-v2.js";
import { cors } from "./gateway-common.js";
import { HanafudaCpuSession, routeCpu } from "./cpu-session.js";
import { HanafudaOnlineRoom } from "./online-room.js";
import { HanafudaDirectory, routeOnlineV3 } from "./directory.js";
export { BaseModeSession as HanafudaModeSession, HanafudaCpuSession, HanafudaOnlineRoom, HanafudaDirectory };
export default {
    async fetch(req, env, ctx) {
        const url = new URL(req.url);
        if (req.method === "OPTIONS")
            return baseWorker.fetch(req, env, ctx);
        if (url.pathname.startsWith("/api/cpu/"))
            return cors(await routeCpu(req, env, url), req, env);
        if (url.pathname.startsWith("/api/online/")) {
            const online = await routeOnlineV3(req, env, url);
            if (online)
                return cors(online, req, env);
        }
        return baseWorker.fetch(req, env, ctx);
    }
};
