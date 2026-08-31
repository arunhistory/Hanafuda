"use strict";
(() => {
    const runtimeWindow = window;
    const EFFECT_URLS = {
        "effect.koikoi.text": "https://mpuhgfbdkxmhynytwhzu.supabase.co/storage/v1/object/public/hanafuda-effects/koikoi-text.png",
        "effect.agari.text": "https://mpuhgfbdkxmhynytwhzu.supabase.co/storage/v1/object/public/hanafuda-effects/agari-text.png"
    };
    runtimeWindow.showCallout = async function (assetId) {
        const isAgari = assetId === "effect.agari.text";
        const label = isAgari ? "あがり" : "こいこい";
        const src = EFFECT_URLS[assetId] || assets.path(assetId);
        const layer = document.createElement("div");
        layer.className = `fx-layer supabase-effect-layer ${isAgari ? "agari-supabase-effect" : "koi-supabase-effect"}`;
        const art = document.createElement("img");
        art.className = "supabase-effect-art";
        art.src = src;
        art.alt = label;
        art.decoding = "async";
        art.draggable = false;
        art.addEventListener("error", () => {
            if (layer.querySelector(".supabase-effect-fallback"))
                return;
            const fallback = document.createElement("strong");
            fallback.className = "supabase-effect-fallback";
            fallback.textContent = label;
            layer.append(fallback);
        }, { once: true });
        layer.append(art);
        matchEffectHost().append(layer);
        await delay(isAgari ? 1750 : 1600);
        layer.remove();
    };
})();
