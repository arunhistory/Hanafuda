type OrientationCapableScreen = Screen & {
  orientation?: ScreenOrientation & { lock?: (orientation: OrientationLockType)=>Promise<void> };
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

function applyLandscapePresentation(){
  const mobile=isPhoneOrTablet();
  document.documentElement.classList.toggle("touch-landscape-device",mobile);
  document.documentElement.classList.toggle("portrait-landscape-fallback",mobile&&portrait.matches);
}

async function requestNativeLandscape(){
  if(!isPhoneOrTablet())return;
  const orientation=(screen as OrientationCapableScreen).orientation;
  if(typeof orientation?.lock!=="function")return;
  try{await orientation.lock("landscape");}catch{}
}

applyLandscapePresentation();
void requestNativeLandscape();

window.addEventListener("orientationchange",applyLandscapePresentation,{passive:true});
window.addEventListener("resize",applyLandscapePresentation,{passive:true});
portrait.addEventListener?.("change",applyLandscapePresentation);

// Browsers that only allow orientation locking after a user gesture get one
// additional native-lock attempt on the first interaction. The CSS fallback is
// already active before that, so the game still launches as a landscape UI.
document.addEventListener("pointerdown",()=>void requestNativeLandscape(),{once:true,passive:true});
