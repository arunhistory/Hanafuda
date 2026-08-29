"use strict";
function shouldStageTransitionVictory() {
    if (!snapshot || !session || session.kind !== "cpu" || !pendingModeTransition)
        return false;
    if (snapshot.phase !== 5 || snapshot.roundIndex + 1 < snapshot.totalRounds)
        return false;
    const [myScore, opponentScore] = perspectiveScores(snapshot);
    return myScore > opponentScore;
}
function stageTransitionVictory(card) {
    if (!snapshot)
        return;
    const [myScore, opponentScore] = perspectiveScores(snapshot);
    card.classList.add("final");
    card.innerHTML = `<h2>勝利</h2><div class="settlement-score">${myScore} - ${opponentScore}</div><p>あなたの勝ちです。</p><div class="screen-actions"><button class="primary" data-action="confirm-transition">次へ</button></div>`;
    card.querySelector("[data-action='confirm-transition']")?.addEventListener("click", () => void beginImpossibleTransition(), { once: true });
}
function syncFirstEncounterPostmatch() {
    if (!snapshot || !session || session.kind !== "cpu" || session.mode !== "impossible")
        return;
    if (snapshot.phase !== 6 || !hiddenFirstEncounter || isUnlocked())
        return;
    app.querySelector("[data-action='cpu-same']")?.remove();
    const reconfigure = app.querySelector("[data-action='cpu-reconfigure']");
    if (reconfigure && reconfigure.textContent !== "プロ対戦設定へ")
        reconfigure.textContent = "プロ対戦設定へ";
}
const transitionUiObserver = new MutationObserver(() => syncFirstEncounterPostmatch());
transitionUiObserver.observe(app, { childList: true, subtree: true });
syncFirstEncounterPostmatch();
document.addEventListener("click", event => {
    const raw = event.target;
    if (!(raw instanceof Element))
        return;
    const trigger = raw.closest("[data-action='accept-transition']");
    if (!trigger || !shouldStageTransitionVictory())
        return;
    const card = app.querySelector(".settlement-card");
    if (!card)
        return;
    event.preventDefault();
    event.stopImmediatePropagation();
    trigger.setAttribute("disabled", "");
    stageTransitionVictory(card);
}, true);
