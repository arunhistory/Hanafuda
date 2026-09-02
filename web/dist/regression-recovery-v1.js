"use strict";
const REGRESSION_SETTINGS_KEY = 'hanafuda.settings.v1';
const REGRESSION_CPU_START_URL = `${API_BASE}/api/cpu/start`;
const REGRESSION_GUARDED_SOCKETS = new WeakSet();
const REGRESSION_CHECKED_SOCKETS = new WeakSet();
function regressionStoredDealer() {
    try {
        const raw = localStorage.getItem(REGRESSION_SETTINGS_KEY);
        if (!raw)
            return null;
        const value = Number(JSON.parse(raw)?.firstDealer);
        return value === -1 || value === 0 || value === 1 ? value : null;
    }
    catch {
        return null;
    }
}
function regressionRestoreDealer() {
    const stored = regressionStoredDealer();
    if (stored !== null)
        settings.firstDealer = stored;
}
function regressionDealerButton(value, label) {
    const selected = settings.firstDealer === value;
    return `<button type="button" class="setup-choice ${selected ? 'selected' : ''}" data-cpu-dealer="${value}" aria-pressed="${selected}">${label}</button>`;
}
function regressionPatchDealerUi() {
    if (currentScreen() !== 'cpu-setup')
        return;
    const row = app.querySelector('.dealer-choice-row');
    if (!row)
        return;
    if (!row.querySelector('[data-cpu-dealer]')) {
        row.innerHTML = regressionDealerButton(-1, 'ランダム') + regressionDealerButton(0, 'あなたが親') + regressionDealerButton(1, '相手が親');
    }
    row.querySelectorAll('[data-cpu-dealer]').forEach(el => {
        const value = Number(el.dataset.cpuDealer), selected = value === settings.firstDealer;
        el.classList.toggle('selected', selected);
        el.setAttribute('aria-pressed', String(selected));
    });
}
function regressionRequestUrl(input) {
    if (typeof input === 'string')
        return new URL(input, location.href).href;
    if (input instanceof URL)
        return input.href;
    return input.url;
}
const REGRESSION_ORIGINAL_FETCH = window.fetch.bind(window);
window.fetch = (async (input, init) => {
    if (regressionRequestUrl(input) === REGRESSION_CPU_START_URL && String(init?.method ?? 'GET').toUpperCase() === 'POST' && typeof init?.body === 'string') {
        try {
            const body = JSON.parse(init.body);
            if (body && typeof body === 'object' && !Array.isArray(body) && body.firstDealer === undefined) {
                return REGRESSION_ORIGINAL_FETCH(input, { ...init, body: JSON.stringify({ ...body, firstDealer: settings.firstDealer }) });
            }
        }
        catch { }
    }
    return REGRESSION_ORIGINAL_FETCH(input, init);
});
async function regressionVerifyOnlineSocket(s, ws) {
    if (REGRESSION_CHECKED_SOCKETS.has(ws) || session !== s || s.socket !== ws)
        return;
    REGRESSION_CHECKED_SOCKETS.add(ws);
    try {
        const result = await api('/api/online/status', { roomCode: s.roomCode, token: s.token });
        if (session !== s || s.socket !== ws || ws.readyState === WebSocket.OPEN)
            return;
        if (result.ok && result.data?.ok) {
            toast('ルームは作成済みです。オンライン接続を再試行します。');
            try {
                ws.close();
            }
            catch { }
            return;
        }
        toast(`オンライン接続に失敗しました: ${result.data?.code ?? 'CONNECTION_FAILED'}`);
    }
    catch {
        toast('オンライン接続を確認できませんでした。再接続します。');
        try {
            ws.close();
        }
        catch { }
    }
}
function regressionGuardOnlineSocket() {
    const s = session;
    if (!s || s.kind !== 'online' || !s.socket)
        return;
    const ws = s.socket;
    if (REGRESSION_GUARDED_SOCKETS.has(ws))
        return;
    REGRESSION_GUARDED_SOCKETS.add(ws);
    const timer = window.setTimeout(() => { if (session === s && s.socket === ws && ws.readyState !== WebSocket.OPEN)
        void regressionVerifyOnlineSocket(s, ws); }, 7000);
    ws.addEventListener('open', () => window.clearTimeout(timer), { once: true });
    ws.addEventListener('error', () => { window.clearTimeout(timer); void regressionVerifyOnlineSocket(s, ws); }, { once: true });
    ws.addEventListener('close', () => { window.clearTimeout(timer); window.setTimeout(regressionGuardOnlineSocket, 2200); }, { once: true });
}
function regressionPatchScreens() {
    const main = app.querySelector('main');
    if (currentScreen() === 'settings')
        main?.classList.add('settings-screen-expanded');
    if (currentScreen() === 'cpu-setup')
        main?.classList.add('cpu-setup-expanded');
    regressionPatchDealerUi();
    regressionGuardOnlineSocket();
}
regressionRestoreDealer();
const REGRESSION_OBSERVER = new MutationObserver(regressionPatchScreens);
REGRESSION_OBSERVER.observe(app, { childList: true, subtree: true });
regressionPatchScreens();
document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target.closest('[data-cpu-dealer]') : null;
    if (!target || !target.closest('#app'))
        return;
    const value = Number(target.dataset.cpuDealer);
    if (value !== -1 && value !== 0 && value !== 1)
        return;
    settings.firstDealer = value;
    saveSettings();
    regressionPatchDealerUi();
});
