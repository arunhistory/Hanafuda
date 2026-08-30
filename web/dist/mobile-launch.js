"use strict";
const mobileDeviceQuery = window.matchMedia("(pointer: coarse)");
const portraitQuery = window.matchMedia("(orientation: portrait)");
let mobileCanvasTimer;
let lastCanvasWidth = 0;
let lastCanvasHeight = 0;
let lastPortrait = null;
function isMobileOrTablet() {
    const ua = navigator.userAgent;
    const mobileUa = /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(ua);
    const ipadDesktopUa = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
    const touchTablet = mobileDeviceQuery.matches && navigator.maxTouchPoints > 0 && Math.min(screen.width, screen.height) <= 1366;
    return mobileUa || ipadDesktopUa || touchTablet;
}
function isChromeMobile() {
    const ua = navigator.userAgent;
    return /Chrome|CriOS/i.test(ua) && !/EdgA|OPR|SamsungBrowser/i.test(ua) && isMobileOrTablet();
}
function viewportSize() {
    const visual = window.visualViewport;
    return {
        width: Math.max(1, Math.round(visual?.width ?? window.innerWidth)),
        height: Math.max(1, Math.round(visual?.height ?? window.innerHeight)),
    };
}
function syncMobileCanvas() {
    const root = document.documentElement;
    if (!isMobileOrTablet()) {
        root.classList.remove("mobile-webapp", "virtual-landscape", "compact-landscape", "phone-landscape", "chrome-mobile");
        root.style.removeProperty("--mobile-canvas-width");
        root.style.removeProperty("--mobile-canvas-height");
        lastCanvasWidth = 0;
        lastCanvasHeight = 0;
        lastPortrait = null;
        return;
    }
    const { width, height } = viewportSize();
    const portrait = height >= width;
    const canvasWidth = portrait ? height : width;
    const canvasHeight = portrait ? width : height;
    const phoneLandscape = canvasHeight <= 520;
    root.classList.add("mobile-webapp");
    root.classList.toggle("chrome-mobile", isChromeMobile());
    root.classList.toggle("virtual-landscape", portrait);
    root.classList.toggle("compact-landscape", canvasHeight <= 430);
    root.classList.toggle("phone-landscape", phoneLandscape);
    if (canvasWidth !== lastCanvasWidth) {
        root.style.setProperty("--mobile-canvas-width", `${canvasWidth}px`);
        lastCanvasWidth = canvasWidth;
    }
    if (canvasHeight !== lastCanvasHeight) {
        root.style.setProperty("--mobile-canvas-height", `${canvasHeight}px`);
        lastCanvasHeight = canvasHeight;
    }
    lastPortrait = portrait;
}
function scheduleMobileCanvasSync(immediate = false) {
    if (mobileCanvasTimer !== undefined)
        window.clearTimeout(mobileCanvasTimer);
    if (immediate) {
        syncMobileCanvas();
        return;
    }
    mobileCanvasTimer = window.setTimeout(() => { mobileCanvasTimer = undefined; syncMobileCanvas(); }, 140);
}
syncMobileCanvas();
window.addEventListener("resize", () => scheduleMobileCanvasSync(), { passive: true });
window.addEventListener("orientationchange", () => scheduleMobileCanvasSync(true), { passive: true });
window.visualViewport?.addEventListener("resize", () => scheduleMobileCanvasSync(), { passive: true });
portraitQuery.addEventListener?.("change", () => scheduleMobileCanvasSync(true));
