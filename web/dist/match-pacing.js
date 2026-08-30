"use strict";
let matchRecapBlocking = false;
function actionActorLabel(event) {
    return Number(event.actor) === playerSeat() ? "あなた" : "相手";
}
function actionMonth(card) { return Math.floor(card / 4); }
function captureGroups(event) {
    const pool = [...(event.capturedCards ?? [])];
    const takeFor = (card) => {
        if (!Number.isInteger(card))
            return [];
        const month = actionMonth(card), taken = [];
        for (let i = pool.length - 1; i >= 0; i--)
            if (actionMonth(pool[i]) === month)
                taken.unshift(pool.splice(i, 1)[0]);
        return taken;
    };
    const hand = takeFor(event.playedCard);
    const draw = takeFor(event.drawnCard);
    if (pool.length) {
        if (Number.isInteger(event.drawnCard))
            draw.push(...pool.splice(0));
        else
            hand.push(...pool.splice(0));
    }
    return { hand, draw };
}
function boardForAction() { return app.querySelector(".board"); }
function actionLabel(event, label) {
    const el = document.createElement("div");
    el.className = `table-action-label ${Number(event.actor) === playerSeat() ? "player-action" : "opponent-action"}`;
    el.textContent = `${actionActorLabel(event)}・${label}`;
    return el;
}
async function showCardToField(event, card, label, from) {
    const board = boardForAction();
    if (!board)
        return;
    const layer = document.createElement("div");
    layer.className = "table-action-layer";
    const origin = from === "deck" ? "from-deck" : Number(event.actor) === playerSeat() ? "from-player" : "from-opponent";
    layer.innerHTML = `<div class="table-action-card ${origin}">${cardImg(card)}</div>`;
    layer.append(actionLabel(event, label));
    board.append(layer);
    await delay(from === "deck" ? 900 : 820);
    layer.remove();
    await delay(320);
}
async function showDeckReveal(event, card) {
    const board = boardForAction();
    if (!board)
        return;
    const layer = document.createElement("div");
    layer.className = "table-action-layer";
    layer.innerHTML = `<div class="table-draw-card"><img class="draw-back" src="${assets.path("cards.back")}" alt="山札"><img class="draw-face" src="${assets.card(card)}" alt="山札からめくった札"></div>`;
    layer.append(actionLabel(event, "山札"));
    board.append(layer);
    await delay(1150);
    layer.remove();
    await delay(360);
}
async function showCaptureMove(event, cards) {
    if (!cards.length)
        return;
    const board = boardForAction();
    if (!board)
        return;
    const toPlayer = Number(event.actor) === playerSeat();
    const layer = document.createElement("div");
    layer.className = "table-action-layer";
    layer.innerHTML = `<div class="table-capture-group ${toPlayer ? "to-player" : "to-opponent"}">${cards.slice(0, 4).map(card => cardImg(card)).join("")}</div>`;
    layer.append(actionLabel(event, "取得"));
    board.append(layer);
    await delay(1050);
    layer.remove();
    await delay(430);
}
async function showDecision(event) {
    const board = boardForAction();
    if (!board)
        return;
    const label = document.createElement("div");
    label.className = "table-decision-label";
    label.textContent = event.chooseKoi ? "こいこい" : "あがり";
    board.append(label);
    await delay(1500);
    label.remove();
    await delay(400);
}
async function playVisibleActionSteps(event) {
    if (settings.skipNormalAnimations)
        return;
    matchRecapBlocking = true;
    try {
        const captures = captureGroups(event);
        if (Number.isInteger(event.playedCard)) {
            await showCardToField(event, event.playedCard, "手札", "hand");
            if (captures.hand.length)
                await showCaptureMove(event, captures.hand);
        }
        if (Number.isInteger(event.drawnCard)) {
            await showDeckReveal(event, event.drawnCard);
            if (captures.draw.length)
                await showCaptureMove(event, captures.draw);
        }
        if (!Number.isInteger(event.playedCard) && !Number.isInteger(event.drawnCard) && event.capturedCards?.length) {
            await showCaptureMove(event, event.capturedCards);
        }
        if (event.type === "koi")
            await showDecision(event);
        await delay(650);
    }
    finally {
        matchRecapBlocking = false;
    }
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
