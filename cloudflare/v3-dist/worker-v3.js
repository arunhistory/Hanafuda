// Cloudflare gateway extension. Existing mode behavior remains in worker-v2.
// TypeScript source; root JS modules are generated build artifacts.
// @ts-ignore - deployment uploads worker-v2.js beside generated worker-v3.js.
import baseWorker, { HanafudaModeSession as BaseModeSession } from "./worker-v2.js";
import { cors, engineCall, json } from "./gateway-common.js";
import { HanafudaCpuSessionDealer, routeCpuDealer } from "./cpu-session-dealer.js";
import { HanafudaOnlineRoom } from "./online-room.js";
import { HanafudaDirectory, routeOnlineV3 } from "./directory.js";
export { BaseModeSession as HanafudaModeSession, HanafudaCpuSessionDealer as HanafudaCpuSession, HanafudaOnlineRoom, HanafudaDirectory };
const TERMS_BODY = `花札 利用規約

本ゲームは無料でご利用いただけるフリーゲームです。

本ゲームは公開前に安全性の確認を行っていますが、プレイおよび利用については各自の責任でお楽しみください。

本ゲームおよび本ゲーム内で使用されているプログラム、画像、文章その他のコンテンツについて、権利者の許可なく転載、再配布、改変して配布することを禁止します。

本ゲームで使用しているライセンスおよびクレジットについては、本利用規約とは別に記載しています。

本ゲームの内容は、予告なく変更、更新、または公開を終了する場合があります。

本ゲームを利用した時点で、本利用規約に同意したものとします。`;
const CREDITS_BODY = `CREDITS

This website uses music and sound effect materials provided by MaouDamashii, Momijiba Music, and Pixabay (SoundReality / Jurij).

Music: MaouDamashii / Momijiba Music
Sound Effects: SoundReality / Jurij from Pixabay

Created by ある〜ん
Development Support: ChatGPT

Except for third-party materials separately credited above, all original content, design, text, game content, and other original materials on this website are © ある〜ん.`;
const LICENSES_BODY = `LICENSES

This website uses music and sound effect materials provided by MaouDamashii, Momijiba Music, and Pixabay (SoundReality / Jurij) in accordance with the respective terms of use and licenses provided by each rights holder.

The copyrights and other rights in those third-party materials remain with their respective rights holders.

MaouDamashii
Music materials are used in accordance with the MaouDamashii Terms of Use.

Momijiba Music
Music materials are used in accordance with the Momijiba Music Terms of Use.

Pixabay / SoundReality / Jurij
Sound effect materials are used in accordance with the Pixabay Content License.

Except for the third-party materials identified above, all copyrights and other intellectual property rights in the original content of this website belong to ある〜ん.

Unauthorized reproduction, redistribution, modification, or use of the original content of this website is prohibited except where permitted by applicable law or expressly authorized by the rights holder.`;
function contentDocument(req, env, key) {
    if (req.method !== "GET")
        return cors(json({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405), req, env);
    if (key === "terms")
        return cors(json({ key, available: true, revision: 1, body: TERMS_BODY }), req, env);
    if (key === "credits")
        return cors(json({ key, available: true, revision: 1, body: CREDITS_BODY }), req, env);
    return cors(json({ key, available: true, revision: 1, body: LICENSES_BODY }), req, env);
}
async function audioProfile(req, env) {
    if (req.method !== "GET")
        return cors(json({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405), req, env);
    try {
        const result = await engineCall(env, { op: "audio_profile" });
        if (!result.ok || result.data?.ok !== true || !result.data?.profile)
            return cors(json({ ok: false, code: "AUDIO_PROFILE_UNAVAILABLE" }, 502), req, env);
        return cors(json({ ok: true, profile: result.data.profile }), req, env);
    }
    catch {
        return cors(json({ ok: false, code: "AUDIO_PROFILE_UNAVAILABLE" }, 502), req, env);
    }
}
export default {
    async fetch(req, env, ctx) {
        const url = new URL(req.url);
        if (req.method === "OPTIONS")
            return baseWorker.fetch(req, env, ctx);
        if (url.pathname === "/api/audio/profile")
            return audioProfile(req, env);
        const contentMatch = url.pathname.match(/^\/v1\/content\/(terms|credits|licenses)$/);
        if (contentMatch)
            return contentDocument(req, env, contentMatch[1]);
        if (url.pathname.startsWith("/api/cpu/"))
            return cors(await routeCpuDealer(req, env, url), req, env);
        if (url.pathname.startsWith("/api/online/")) {
            const online = await routeOnlineV3(req, env, url);
            if (online)
                return cors(online, req, env);
        }
        return baseWorker.fetch(req, env, ctx);
    }
};
