"use strict";
(() => {
    const runtimeWindow = window;
    const baseSendAction = sendAction;
    function isFinalRoundSettlement() {
        if (!snapshot || snapshot.phase !== 5)
            return false;
        const roundIndex = Number(snapshot.roundIndex);
        const totalRounds = Number(snapshot.totalRounds);
        return Number.isInteger(roundIndex) && Number.isInteger(totalRounds) && totalRounds > 0 && roundIndex + 1 >= totalRounds;
    }
    function purgeTransient() {
        if (typeof runtimeWindow.__hanafudaPurgeTransientMatchOverlays === "function") {
            runtimeWindow.__hanafudaPurgeTransientMatchOverlays();
            return;
        }
        app.querySelectorAll(".modal-layer,.settlement-layer,.settlement-card,.supabase-effect-layer,.dramatic-callout-layer").forEach(el => el.remove());
    }
    runtimeWindow.sendAction = async function (action, payload = {}) {
        if (action !== "next_round" || session?.kind !== "cpu" || !isFinalRoundSettlement())
            return baseSendAction(action, payload);
        if (busy || !session || !snapshot)
            return;
        busy = true;
        matchInteractionReady = false;
        purgeTransient();
        try {
            const result = await api("/api/cpu/action", { sessionId: session.sessionId, token: session.token, version: session.version, action, ...payload });
            if (!result.ok || !result.data?.ok)
                throw new Error(result.data?.code || "FINALIZE_FAILED");
            session.version = Number(result.data.version);
            pendingModeTransition = result.data.modeTransition?.transition === "impossible";
            if (result.data.unlockGranted === true)
                grantUnlock();
            if (!result.data.snapshot)
                throw new Error("FINAL_SNAPSHOT_MISSING");
            snapshot = result.data.snapshot;
            purgeTransient();
            renderMatch();
        }
        catch (e) {
            toast(e instanceof Error ? e.message : "最終結果の確定に失敗しました");
            try {
                await refreshStatus();
            }
            catch { }
        }
        finally {
            busy = false;
            if (snapshot && currentScreen() === "match")
                renderMatch();
        }
    };
    runtimeWindow.__hanafudaRoundEndBoundaryVersion = "1";
})();
