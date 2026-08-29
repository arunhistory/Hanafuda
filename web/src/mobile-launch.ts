const mobileDeviceQuery=window.matchMedia("(pointer: coarse)");
const portraitQuery=window.matchMedia("(orientation: portrait)");

function isMobileOrTablet(){
  const ua=navigator.userAgent;
  const mobileUa=/Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(ua);
  const ipadDesktopUa=navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1;
  const touchTablet=mobileDeviceQuery.matches&&navigator.maxTouchPoints>0&&Math.min(screen.width,screen.height)<=1366;
  return mobileUa||ipadDesktopUa||touchTablet;
}

function viewportSize(){
  const visual=window.visualViewport;
  return {
    width:Math.max(1,Math.round(visual?.width??window.innerWidth)),
    height:Math.max(1,Math.round(visual?.height??window.innerHeight)),
  };
}

function syncMobileCanvas(){
  const root=document.documentElement;
  if(!isMobileOrTablet()){
    root.classList.remove("mobile-webapp","virtual-landscape","compact-landscape");
    root.style.removeProperty("--mobile-canvas-width");
    root.style.removeProperty("--mobile-canvas-height");
    return;
  }

  const {width,height}=viewportSize();
  const portrait=height>=width;
  const canvasWidth=portrait?height:width;
  const canvasHeight=portrait?width:height;

  root.classList.add("mobile-webapp");
  root.classList.toggle("virtual-landscape",portrait);
  root.classList.toggle("compact-landscape",canvasHeight<=430);
  root.style.setProperty("--mobile-canvas-width",`${canvasWidth}px`);
  root.style.setProperty("--mobile-canvas-height",`${canvasHeight}px`);
}

syncMobileCanvas();
window.addEventListener("resize",syncMobileCanvas,{passive:true});
window.addEventListener("orientationchange",syncMobileCanvas,{passive:true});
window.visualViewport?.addEventListener("resize",syncMobileCanvas,{passive:true});
portraitQuery.addEventListener?.("change",syncMobileCanvas);
