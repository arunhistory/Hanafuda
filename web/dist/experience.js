"use strict";
let observedDepth = stack.length;
let navigationSyncing = false;
function dealSequenceIndex(kind, index, s) {
    const group = Math.floor(index / 2), within = index % 2;
    if (kind === "field")
        return group * 6 + within;
    const seat = kind === "player" ? playerSeat() : opponentSeat();
    const offset = seat === s.dealer ? 4 : 2;
    return group * 6 + offset + within;
}
function applyDealSequence() {
    if (!snapshot || currentScreen() !== "match")
        return;
    const s = snapshot;
    app.querySelectorAll("[data-field-index]").forEach((el, i) => el.style.setProperty("--deal-index", String(dealSequenceIndex("field", i, s))));
    app.querySelectorAll("[data-hand-index]").forEach((el, i) => el.style.setProperty("--deal-index", String(dealSequenceIndex("player", i, s))));
    app.querySelectorAll(".opponent-zone .hand-row > .card").forEach((el, i) => el.style.setProperty("--deal-index", String(dealSequenceIndex("opponent", i, s))));
}
function applyMatchPresentation() {
    applyDealSequence();
    const menu = app.querySelector("[data-action='pause']");
    if (menu)
        menu.textContent = "☰ メニュー";
    const final = app.querySelector(".settlement-card.final");
    if (final && session?.kind === "cpu" && session.mode === "impossible")
        final.classList.add("hidden-final");
}
function actionGhost(card, kind, actor) {
    const img = document.createElement("img");
    img.className = `action-ghost ${kind} ${actor === playerSeat() ? "from-player" : "from-opponent"}`;
    img.src = assets.card(card);
    img.alt = "";
    img.setAttribute("aria-hidden", "true");
    document.body.append(img);
    img.addEventListener("animationend", () => img.remove(), { once: true });
    setTimeout(() => img.remove(), 1100);
}
function animateAuthoritativeAction(event) {
    if (settings.skipNormalAnimations || currentScreen() !== "match")
        return;
    const actor = Number(event.actor);
    if (Number.isInteger(event.playedCard))
        actionGhost(event.playedCard, "played", actor);
    if (Number.isInteger(event.drawnCard))
        setTimeout(() => actionGhost(event.drawnCard, "drawn", actor), 180);
}
function syncHistoryDepth() {
    if (navigationSyncing)
        return;
    const depth = stack.length;
    if (depth > observedDepth) {
        history.pushState({ hanafuda: true, depth }, "");
    }
    else if (depth < observedDepth) {
        history.replaceState({ hanafuda: true, depth }, "");
    }
    observedDepth = depth;
}
async function leaveCurrentHierarchyFromBrowser() {
    if (modal) {
        modal = null;
        if (currentScreen() === "match")
            renderMatch();
        else
            void render();
        history.pushState({ hanafuda: true, depth: stack.length }, "");
        return;
    }
    if (stack.length <= 1)
        return;
    navigationSyncing = true;
    stack.pop();
    observedDepth = stack.length;
    if (session) {
        await closeMatch(false);
    }
    else {
        await render();
    }
    navigationSyncing = false;
}
function installHierarchyNavigation() {
    history.replaceState({ hanafuda: true, depth: stack.length }, "");
    document.addEventListener("click", event => {
        const target = event.target?.closest("[data-action='back']");
        if (!target)
            return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (stack.length > 1)
            history.back();
    }, true);
    window.addEventListener("popstate", () => void leaveCurrentHierarchyFromBrowser());
}
window.addEventListener("hanafuda-audio-hook", event => {
    const detail = event.detail;
    if (detail?.name === "card-action" && detail.event)
        animateAuthoritativeAction(detail.event);
});
const experienceObserver = new MutationObserver(() => {
    applyMatchPresentation();
    syncHistoryDepth();
});
experienceObserver.observe(app, { childList: true, subtree: true });
installHierarchyNavigation();
applyMatchPresentation();
