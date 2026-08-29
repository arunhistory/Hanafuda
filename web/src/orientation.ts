type OrientationCapableScreen = Screen & {
  orientation?: ScreenOrientation & { lock?: (orientation:string)=>Promise<void> };
};

type FullscreenCapableDocument = Document & {
  webkitFullscreenElement?: Element | null;
};

type FullscreenCapableElement = HTMLElement & {
  webkitRequestFullscreen?: ()=>Promise<void> | void;
};

const coarsePointer=window.matchMedia("(pointer: coarse)");
const narrowDevice=window.matchMedia("(max-device-width: 1366px)");
const portrait=window.matchMedia("(orientation: portrait)");

function isPhoneOrTablet(){
  const ua=navigator.userAgent;
  const mobileUa=/Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(ua);
  const ipadDesktopUa=navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1;
  return mobileUa||ipadDesktopUa||(coarsePointer.matches&&narrowDevice.matches);
}

function ensureOrientationGate(){
  let gate=document.querySelector<HTMLElement>("#orientation-gate");
  if(gate)return gate;
  gate=document.createElement("div");
  gate.id="orientation-gate";
  gate.className="orientation-gate";
  gate.setAttribute("role","status");
  gate.setAttribute("aria-live","polite");
  gate.innerHTML='<div class="orientation-gate-card"><div class="orientation-gate-mark">↻</div><strong>横画面で起動します</strong><p>端末を横向きにしてください。対応ブラウザでは自動的に横画面へ切り替えます。</p></div>';
  document.body.append(gate);
  return gate;
}

function applyLandscapePresentation(){
  const mobile=isPhoneOrTablet();
  document.documentElement.classList.toggle("touch-landscape-device",mobile);
  document.documentElement.classList.toggle("portrait-device",mobile&&portrait.matches);
  if(mobile)ensureOrientationGate();
  else document.querySelector("#orientation-gate")?.remove();
}

async function requestFullscreenForOrientation(){
  if(!isPhoneOrTablet())return;
  const doc=document as FullscreenCapableDocument;
  if(document.fullscreenElement||doc.webkitFullscreenElement)return;
  const root=document.documentElement as FullscreenCapableElement;
  try{
    if(typeof root.requestFullscreen==="function")await root.requestFullscreen();
    else if(typeof root.webkitRequestFullscreen==="function")await root.webkitRequestFullscreen();
  }catch{}
}

async function requestNativeLandscape(){
  if(!isPhoneOrTablet())return;
  const orientation=(screen as OrientationCapableScreen).orientation;
  if(typeof orientation?.lock!=="function")return;
  try{await orientation.lock("landscape");}catch{}
}

async function requestLandscapeFromGesture(){
  await requestFullscreenForOrientation();
  await requestNativeLandscape();
  applyLandscapePresentation();
}

applyLandscapePresentation();
void requestNativeLandscape();

window.addEventListener("orientationchange",applyLandscapePresentation,{passive:true});
window.addEventListener("resize",applyLandscapePresentation,{passive:true});
portrait.addEventListener?.("change",applyLandscapePresentation);
document.addEventListener("pointerdown",()=>void requestLandscapeFromGesture(),{once:true,passive:true});
