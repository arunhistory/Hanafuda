"use strict";
(() => {
    const BASE = "https://mpuhgfbdkxmhynytwhzu.supabase.co/storage/v1/object/public/hanafuda-assets";
    const fixed = {
        "cards.sheet": `${BASE}/cards/card-sheet.png`,
        "cards.back": `${BASE}/cards/card-back.png`,
        "background.match.normal": `${BASE}/backgrounds/game-normal.png`,
        "background.match.corrupted": `${BASE}/backgrounds/game-corrupted.png`
    };
    const fallbackPath = assets.path.bind(assets);
    assets.path = function (id) { return fixed[id] ?? fallbackPath(id); };
    assets.card = function (card) {
        if (!Number.isInteger(card) || card < 0 || card >= 48)
            throw new Error("CARD_ID_INVALID");
        const month = Math.floor(card / 4) + 1, col = card % 4 + 1;
        const id = `m${String(month).padStart(2, "0")}-c${col}`;
        return `${BASE}/cards/generated/${id}.png`;
    };
    window.__hanafudaSupabaseRuntimeAssetsVersion = "1";
})();
