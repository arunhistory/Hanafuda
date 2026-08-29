type UiProfile="desktop"|"mobile_landscape";
type OrientationCapableScreen=Screen&{orientation?:ScreenOrientation&{lock?:(orientation:string)=>Promise<void>}};
type FullscreenCapableDocument=Document&{webkitFullscreenElement?:Element|null};
type FullscreenCapableElement=HTMLElement&{webkitRequestFullscreen?:()=>Promise<void>|void};

const UI_PROFILE_URL="https://mpuhgfbdkxmhynytwhzu.supabase.co/functions/v1/hanafuda-ui-profile";
const portrait=window.matchMedia("(orientation: portrait)");
let activeProfile:UiProfile|null=null;

function ensureOrientationGate(){
  let gate=document.querySelector<HTMLElement>("#orientation-gate");
  if(gate)return gate;
  gate=document.createElement("div");
  gate.id="orientation-gate";
  gate.className="orientation-gate";
  gate.setAttribute("role","status");
  gate.setAttribute("aria-live","polite");
  gate.innerHTML='<div class="orientation-gate-card"><div class="orientation-gate-mark">↔</div><strong>横画面で起動します</strong><p>端末を横向きにしてください。対応ブラウザでは自動的に横画面へ切り替えます。</p></div>';
  document.body.append(gate);
  return gate;
}

function applyProfile(profile:UiProfile){
  activeProfile=profile;
  const mobile=profile==="mobile_landscape";
  document.documentElement.dataset.uiProfile=profile;
  document.documentElement.classList.toggle("touch-landscape-device",mobile);
  document.documentElement.classList.toggle("portrait-device",mobile&&portrait.matches);
  if(mobile)ensureOrientationGate();
  else document.querySelector("#orientation-gate")?.remove();
}

async function resolveProfile():Promise<UiProfile>{
  try{
    const response=await fetch(UI_PROFILE_URL,{
      method:"POST",
      headers:{"content-type":"application/json"},
      cache:"no-store",
      body:JSON.stringify({
        userAgent:navigator.userAgent,
        platform:navigator.platform,
        maxTouchPoints:navigator.maxTouchPoints,
        coarsePointer:window.matchMedia("(pointer: coarse)").matches,
        maxDeviceWidth:Math.max(screen.width,screen.height),
      }),
    });
    const data=await response.json().catch(()=>null);
    if(response.ok&&(data?.profile==="desktop"||data?.profile==="mobile_landscape"))return data.profile;
  }catch{}
  return "desktop";
}

function refreshOrientationClass(){
  if(activeProfile!=="mobile_landscape")return;
  document.documentElement.classList.toggle("portrait-device",portrait.matches);
}

async function requestFullscreenForOrientation(){
  if(activeProfile!=="mobile_landscape")return;
  const doc=document as FullscreenCapableDocument;
  if(document.fullscreenElement||doc.webkitFullscreenElement)return;
  const root=document.documentElement as FullscreenCapableElement;
  try{
    if(typeof root.requestFullscreen==="function")await root.requestFullscreen();
    else if(typeof root.webkitRequestFullscreen==="function")await root.webkitRequestFullscreen();
  }catch{}
}

async function requestNativeLandscape(){
  if(activeProfile!=="mobile_landscape")return;
  const orientation=(screen as OrientationCapableScreen).orientation;
  if(typeof orientation?.lock!=="function")return;
  try{await orientation.lock("landscape");}catch{}
}

async function requestLandscapeFromGesture(){
  if(activeProfile!=="mobile_landscape")return;
  await requestFullscreenForOrientation();
  await requestNativeLandscape();
  refreshOrientationClass();
}

void (async()=>{
  const profile=await resolveProfile();
  applyProfile(profile);
  if(profile==="mobile_landscape")void requestNativeLandscape();
})();

window.addEventListener("orientationchange",refreshOrientationClass,{passive:true});
window.addEventListener("resize",refreshOrientationClass,{passive:true});
portrait.addEventListener?.("change",refreshOrientationClass);
document.addEventListener("pointerdown",()=>void requestLandscapeFromGesture(),{once:true,passive:true});
