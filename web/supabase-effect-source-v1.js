(()=>{
  const EFFECT_URLS={
    "effect.koikoi.text":"https://mpuhgfbdkxmhynytwhzu.supabase.co/storage/v1/object/public/hanafuda-effects/koikoi-text.png",
    "effect.agari.text":"https://mpuhgfbdkxmhynytwhzu.supabase.co/storage/v1/object/public/hanafuda-effects/agari-text.png"
  };

  showCallout=async function(assetId){
    const isAgari=assetId==="effect.agari.text";
    const label=isAgari?"あがり":"こいこい";
    const src=EFFECT_URLS[assetId]||assets.path(assetId);
    const layer=document.createElement("div");
    layer.className=`fx-layer dramatic-callout-layer ${isAgari?"agari-dramatic":"koi-dramatic"}`;
    layer.innerHTML=`<div class="dramatic-rays" aria-hidden="true"></div><div class="dramatic-flash" aria-hidden="true"></div><div class="dramatic-callout"><strong class="dramatic-callout-text">${label}</strong><img class="dramatic-callout-art" src="${src}" alt="${label}"></div>`;
    const art=layer.querySelector(".dramatic-callout-art");
    art?.addEventListener("load",()=>layer.classList.add("art-loaded"),{once:true});
    matchEffectHost().append(layer);
    await delay(isAgari?1750:1600);
    layer.remove();
  };
})();
