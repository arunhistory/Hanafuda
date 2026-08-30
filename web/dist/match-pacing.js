"use strict";
let matchRecapQueue = Promise.resolve();
let matchRecapBlocking = false;
function actionActorLabel(event) {
    return Number(event.actor) === playerSeat() ? "あなた" : "相手";
}
function actionRecapRows(event) {
    const rows = [];
    if (Number.isInteger(event.playedCard))
        rows.push(`<div><span>手札から</span>${cardImg(event.playedCard)}</div>`);
    if (Number.isInteger(event.drawnCard))
        rows.push(`<div><span>山札から</span>${cardImg(event.drawnCard)}</div>`);
    if (event.capturedCards?.length)
        rows.push(`<div class="captured"><span>取得</span><div class="recap-cards">${event.capturedCards.slice(0, 4).map(card => cardImg(card)).join("")}</div></div>`);
    if (event.type === "koi")
        rows.push(`<div class="decision"><span>${event.chooseKoi ? "こいこい" : "あがり"}</span></div>`);
    return rows.join("");
}
async function showActionRecap(event) {
    const rows = actionRecapRows(event);
    if (!rows)
        return;
    matchRecapBlocking = true;
    const layer = document.createElement("div");
    layer.className = `match-action-recap ${Number(event.actor) === playerSeat() ? "player-action" : "opponent-action"}`;
    layer.innerHTML = `<section class="match-action-card"><strong>${actionActorLabel(event)}</strong>${rows}</section>`;
    app.append(layer);
    await delay(event.capturedCards?.length ? 1100 : 900);
    layer.remove();
    await delay(260);
}
function queueActionRecap(event) {
    matchRecapQueue = matchRecapQueue.then(() => showActionRecap(event)).finally(() => {
        if (!app.querySelector(".match-action-recap"))
            matchRecapBlocking = false;
    });
}
document.addEventListener("click", event => {
    if (!matchRecapBlocking)
        return;
    const target = event.target?.closest("#app button,#app [data-hand-index],#app [data-field-index]");
    if (!target)
        return;
    event.preventDefault();
    event.stopImmediatePropagation();
}, true);
window.addEventListener("hanafuda-audio-hook", event => {
    const detail = event.detail;
    if (detail?.name === "card-action" && detail.event && !settings.skipNormalAnimations)
        queueActionRecap(detail.event);
});
