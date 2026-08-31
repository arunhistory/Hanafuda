"use strict";
(() => {
    'use strict';
    const BASE = 'https://mpuhgfbdkxmhynytwhzu.supabase.co/storage/v1/object/public/hanafuda-audio/';
    const SOURCES = Object.freeze({
        normalBgm: BASE + 'normal-bgm.mp3',
        impossibleBgm: BASE + 'impossible-bgm.ogg',
        impossibleUnlock: BASE + 'impossible-unlock-se.mp3',
        pauseOpen: BASE + 'pause-open-se.mp3',
        pauseClose: BASE + 'pause-close-se.mp3',
        menuSelect: BASE + 'menu-select-se.mp3',
        collapse: BASE + 'collapse-se.mp3',
        collapseMain: BASE + 'collapse-main-se.mp3',
        finalSettlement: BASE + 'final-settlement-se.mp3'
    });
    let userActivated = false;
    let bgmKind = 'none';
    let bgm = null;
    let lastCorrupted = false;
    let finalVisible = false;
    function audio(src, { loop = false, preload = 'none' } = {}) {
        const a = new Audio();
        a.src = src;
        a.loop = loop;
        a.preload = preload;
        a.crossOrigin = 'anonymous';
        return a;
    }
    function safePlay(a) {
        if (!userActivated)
            return;
        const p = a.play();
        if (p && typeof p.catch === 'function')
            p.catch(() => { });
    }
    function stopBgm() {
        if (bgm) {
            try {
                bgm.pause();
                bgm.currentTime = 0;
            }
            catch { }
        }
        bgm = null;
        bgmKind = 'none';
    }
    function setBgm(kind) {
        if (kind === bgmKind)
            return;
        stopBgm();
        if (kind === 'none')
            return;
        bgmKind = kind;
        bgm = audio(kind === 'impossible' ? SOURCES.impossibleBgm : SOURCES.normalBgm, { loop: true, preload: 'metadata' });
        bgm.volume = 0.62;
        safePlay(bgm);
    }
    function playSe(src, volume = 1) {
        const a = audio(src, { preload: 'auto' });
        a.volume = volume;
        safePlay(a);
        return a;
    }
    function playCollapsePair() {
        if (!userActivated)
            return;
        const a = audio(SOURCES.collapse, { preload: 'auto' }), b = audio(SOURCES.collapseMain, { preload: 'auto' });
        a.volume = .9;
        b.volume = .92;
        // Start both from the same task so their clocks are as close as HTMLAudio allows.
        safePlay(a);
        safePlay(b);
    }
    function matchState() {
        const match = document.querySelector('.match-screen');
        if (!match)
            return { active: false, corrupted: false };
        return { active: true, corrupted: match.classList.contains('corrupted') };
    }
    function finalState() {
        return !!document.querySelector('.final-result-mode,.final-result-screen,[data-final-result="1"]');
    }
    function syncPresentation() {
        const state = matchState();
        if (state.active) {
            if (state.corrupted && !lastCorrupted)
                playSe(SOURCES.impossibleUnlock, .95);
            lastCorrupted = state.corrupted;
            setBgm(state.corrupted ? 'impossible' : 'normal');
        }
        else {
            lastCorrupted = false;
            setBgm('none');
        }
        const nowFinal = finalState();
        if (nowFinal && !finalVisible)
            playSe(SOURCES.finalSettlement, .95);
        finalVisible = nowFinal;
    }
    function activate() {
        if (userActivated)
            return;
        userActivated = true;
        syncPresentation();
    }
    document.addEventListener('pointerdown', activate, { capture: true, once: true });
    document.addEventListener('keydown', activate, { capture: true, once: true });
    document.addEventListener('click', event => {
        const el = event.target instanceof Element ? event.target.closest('button,[data-action],[data-modal]') : null;
        if (!el)
            return;
        const action = el.getAttribute('data-action');
        const modal = el.getAttribute('data-modal');
        if (action === 'pause') {
            playSe(SOURCES.pauseOpen, .85);
            return;
        }
        if (modal === 'close') {
            playSe(SOURCES.pauseClose, .85);
            return;
        }
        if (el.closest('.modal') || modal)
            playSe(SOURCES.menuSelect, .72);
    }, true);
    window.addEventListener('hanafuda-audio-hook', event => {
        const detail = event.detail;
        const name = detail ? String(detail.name ?? '') : '';
        if (name === 'impossible-collapse')
            playCollapsePair();
    });
    const app = document.querySelector('#app');
    if (app)
        new MutationObserver(syncPresentation).observe(app, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
    window.addEventListener('pagehide', stopBgm);
    syncPresentation();
})();
