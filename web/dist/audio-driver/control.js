import { AUDIO_CHANNEL, AUDIO_COMMAND, loadDriverWasm } from './driver/driver.js';
import { loadCommonWasm } from './common/common.js';
import { loadLocalWasm } from './local/local.js';
const STORAGE_ORIGIN = 'https://mpuhgfbdkxmhynytwhzu.supabase.co';
const PUBLIC_STORAGE_PREFIX = '/storage/v1/object/public/';
const PROFILE_URL = 'https://hanafuda-system.garigarimegane625.workers.dev/api/audio/profile';
const MAX_AUDIO_BYTES = 20_000_000;
const COMMAND_EVENT = 'hanafuda-audio-driver-command';
const RESULT_EVENT = 'hanafuda-audio-driver-result';
const FAULT_EVENT = 'hanafuda-audio-driver-fault';
const modules = Promise.all([loadDriverWasm(), loadCommonWasm(), loadLocalWasm()]);
let context = null;
let bgmSource = null;
let bgmGain = null;
let seGain = null;
const seSources = new Set();
const bufferCache = new Map();
const activationWaiters = new Set();
let readyState = false;
let sequence = 0;
function audioContext() {
    if (context)
        return context;
    const Ctor = window.AudioContext ?? window.webkitAudioContext;
    if (!Ctor)
        throw new Error('AUDIO_CONTEXT_UNAVAILABLE');
    context = new Ctor({ latencyHint: 'interactive' });
    bgmGain = context.createGain();
    seGain = context.createGain();
    bgmGain.connect(context.destination);
    seGain.connect(context.destination);
    return context;
}
function releaseActivationWaiters() {
    for (const resolve of activationWaiters)
        resolve();
    activationWaiters.clear();
}
async function activate() {
    try {
        const ctx = audioContext();
        if (ctx.state !== 'running')
            await ctx.resume();
        if (ctx.state === 'running') {
            releaseActivationWaiters();
            return true;
        }
    }
    catch { }
    return false;
}
function waitForActivation() {
    const ctx = audioContext();
    if (ctx.state === 'running')
        return Promise.resolve();
    return new Promise(resolve => activationWaiters.add(resolve));
}
function sourceUrl(value) {
    if (typeof value !== 'string' || !value)
        return null;
    let url;
    try {
        url = new URL(value, location.href);
    }
    catch {
        return null;
    }
    if (url.origin !== STORAGE_ORIGIN || !url.pathname.startsWith(PUBLIC_STORAGE_PREFIX))
        return null;
    return url.href;
}
function hash32(value) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < value.length; i++) {
        h ^= value.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
    }
    return h || 1;
}
async function loadBuffer(src) {
    const cached = bufferCache.get(src);
    if (cached)
        return cached;
    const pending = (async () => {
        const response = await fetch(src, { cache: 'force-cache', credentials: 'omit', mode: 'cors' });
        if (!response.ok)
            throw new Error(`AUDIO_SOURCE_${response.status}`);
        const declared = Number(response.headers.get('content-length') ?? 0);
        if (declared > MAX_AUDIO_BYTES)
            throw new Error('AUDIO_SOURCE_TOO_LARGE');
        const bytes = await response.arrayBuffer();
        if (bytes.byteLength === 0 || bytes.byteLength > MAX_AUDIO_BYTES)
            throw new Error('AUDIO_SOURCE_SIZE_INVALID');
        return await audioContext().decodeAudioData(bytes.slice(0));
    })().catch(error => {
        bufferCache.delete(src);
        throw error;
    });
    bufferCache.set(src, pending);
    return pending;
}
function stopBgmNode() {
    const current = bgmSource;
    bgmSource = null;
    if (current) {
        current.onended = null;
        try {
            current.stop();
        }
        catch { }
        try {
            current.disconnect();
        }
        catch { }
    }
}
function stopSeNodes() {
    for (const node of seSources) {
        node.onended = null;
        try {
            node.stop();
        }
        catch { }
        try {
            node.disconnect();
        }
        catch { }
    }
    seSources.clear();
}
function normalizeVolume(value, clamp) {
    const n = typeof value === 'number' && Number.isFinite(value) ? value : 1;
    return clamp(Math.round(n * 1000)) / 1000;
}
async function playBgm(src, loop, volume) {
    const [, common, local] = await modules;
    const globalToken = local.local_global_token();
    const bgmToken = local.local_next_bgm();
    const id = hash32(src);
    const buffer = await loadBuffer(src);
    await waitForActivation();
    if (!local.local_is_global_current(globalToken) || !local.local_is_bgm_current(bgmToken))
        return;
    stopBgmNode();
    const ctx = audioContext();
    const node = ctx.createBufferSource();
    node.buffer = buffer;
    node.loop = common.common_bool(loop ? 1 : 0) === 1;
    if (bgmGain)
        bgmGain.gain.setValueAtTime(volume, ctx.currentTime);
    node.connect(bgmGain);
    bgmSource = node;
    local.local_set_bgm(id);
    node.onended = () => {
        if (bgmSource === node) {
            bgmSource = null;
            local.local_clear_bgm();
        }
        try {
            node.disconnect();
        }
        catch { }
    };
    node.start(0);
}
async function playSe(src, volume) {
    const [, , local] = await modules;
    const globalToken = local.local_global_token();
    const seToken = local.local_se_token();
    const buffer = await loadBuffer(src);
    await waitForActivation();
    if (!local.local_is_global_current(globalToken) || !local.local_is_se_current(seToken))
        return;
    const ctx = audioContext();
    const node = ctx.createBufferSource();
    node.buffer = buffer;
    if (seGain)
        seGain.gain.setValueAtTime(volume, ctx.currentTime);
    node.connect(seGain);
    seSources.add(node);
    node.onended = () => {
        seSources.delete(node);
        try {
            node.disconnect();
        }
        catch { }
    };
    node.start(0);
}
function commandOpcode(type) {
    return type === 'prepare' ? AUDIO_COMMAND.prepare :
        type === 'play' ? AUDIO_COMMAND.play :
            type === 'stop' ? AUDIO_COMMAND.stop :
                type === 'stop-all' ? AUDIO_COMMAND.stopAll :
                    type === 'set-volume' ? AUDIO_COMMAND.setVolume : 0;
}
function channelCode(channel) {
    return channel === 'bgm' ? AUDIO_CHANNEL.bgm : channel === 'se' ? AUDIO_CHANNEL.se : -1;
}
function runDetached(task, requestId, seq) {
    void task.catch(error => window.dispatchEvent(new CustomEvent(FAULT_EVENT, { detail: {
            ok: false,
            sequence: seq,
            requestId,
            code: error instanceof Error ? error.message : 'AUDIO_DRIVER_ERROR'
        } })));
}
async function execute(command) {
    const [driver, common, local] = await modules;
    sequence = common.common_next_sequence(sequence) >>> 0;
    const requestId = typeof command?.requestId === 'string' ? command.requestId : undefined;
    const fail = (code) => ({ ok: false, sequence, requestId, code });
    if (!command || typeof command !== 'object' || typeof command.type !== 'string')
        return fail('INVALID_COMMAND');
    const opcode = commandOpcode(command.type);
    if (driver.driver_validate_command(opcode) !== 1)
        return fail('INVALID_COMMAND');
    try {
        if (command.type === 'prepare') {
            const src = sourceUrl(command.src);
            if (!src)
                return fail('INVALID_SOURCE');
            await loadBuffer(src);
        }
        else if (command.type === 'play') {
            if (driver.driver_validate_channel(channelCode(command.channel)) !== 1)
                return fail('INVALID_CHANNEL');
            const src = sourceUrl(command.src);
            if (!src)
                return fail('INVALID_SOURCE');
            const volume = normalizeVolume(command.volume, common.common_clamp_milli);
            if (command.channel === 'bgm')
                runDetached(playBgm(src, command.loop === true, volume), requestId, sequence);
            else
                runDetached(playSe(src, volume), requestId, sequence);
        }
        else if (command.type === 'stop') {
            if (driver.driver_validate_channel(channelCode(command.channel)) !== 1)
                return fail('INVALID_CHANNEL');
            if (command.channel === 'bgm') {
                local.local_next_bgm();
                local.local_clear_bgm();
                stopBgmNode();
            }
            else {
                local.local_invalidate_se();
                stopSeNodes();
            }
        }
        else if (command.type === 'stop-all') {
            local.local_invalidate_all();
            stopBgmNode();
            stopSeNodes();
        }
        else if (command.type === 'set-volume') {
            if (driver.driver_validate_channel(channelCode(command.channel)) !== 1)
                return fail('INVALID_CHANNEL');
            const ctx = audioContext();
            const volume = normalizeVolume(command.volume, common.common_clamp_milli);
            const gain = command.channel === 'bgm' ? bgmGain : seGain;
            gain?.gain.setValueAtTime(volume, ctx.currentTime);
        }
        return { ok: true, sequence, requestId };
    }
    catch (error) {
        return fail(error instanceof Error ? error.message : 'AUDIO_DRIVER_ERROR');
    }
}
function sanitizeCommand(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return null;
    const v = value;
    const type = String(v.type ?? '');
    if (type === 'prepare') {
        const src = sourceUrl(v.src);
        return src ? { type: 'prepare', src } : null;
    }
    if (type === 'play') {
        const src = sourceUrl(v.src), channel = v.channel === 'bgm' || v.channel === 'se' ? v.channel : null;
        if (!src || !channel)
            return null;
        const volume = typeof v.volume === 'number' && Number.isFinite(v.volume) ? v.volume : 1;
        return { type: 'play', channel, src, loop: v.loop === true, volume };
    }
    if (type === 'stop' && (v.channel === 'bgm' || v.channel === 'se'))
        return { type: 'stop', channel: v.channel };
    if (type === 'stop-all')
        return { type: 'stop-all' };
    if (type === 'set-volume' && (v.channel === 'bgm' || v.channel === 'se') && typeof v.volume === 'number' && Number.isFinite(v.volume))
        return { type: 'set-volume', channel: v.channel, volume: v.volume };
    return null;
}
async function loadProfile() {
    const response = await fetch(PROFILE_URL, { method: 'GET', headers: { accept: 'application/json' }, cache: 'no-store', credentials: 'omit', mode: 'cors' });
    if (!response.ok)
        throw new Error(`AUDIO_PROFILE_${response.status}`);
    const raw = await response.json().catch(() => null);
    if (!raw || raw.ok !== true || !raw.profile || typeof raw.profile !== 'object')
        throw new Error('AUDIO_PROFILE_INVALID');
    const profile = raw.profile;
    const version = Number(profile.version);
    if (!Number.isSafeInteger(version) || version < 1)
        throw new Error('AUDIO_PROFILE_VERSION_INVALID');
    const preload = Array.isArray(profile.preload) ? profile.preload.map(sourceUrl).filter((x) => !!x) : [];
    const hooks = {};
    if (!profile.hooks || typeof profile.hooks !== 'object' || Array.isArray(profile.hooks))
        throw new Error('AUDIO_PROFILE_HOOKS_INVALID');
    for (const [name, list] of Object.entries(profile.hooks)) {
        if (!/^[a-z0-9-]{1,64}$/.test(name) || !Array.isArray(list) || list.length > 8)
            throw new Error('AUDIO_PROFILE_HOOK_INVALID');
        const commands = list.map(sanitizeCommand);
        if (commands.some(x => x === null))
            throw new Error('AUDIO_PROFILE_COMMAND_INVALID');
        hooks[name] = commands;
    }
    return { version, preload: [...new Set(preload)], hooks };
}
function profileHookName(name, detail) {
    if (name === 'match-start')
        return detail.mode === 'impossible' ? 'match-start-impossible' : 'match-start-normal';
    return name;
}
function emitFault(code) {
    window.dispatchEvent(new CustomEvent(FAULT_EVENT, { detail: { ok: false, sequence, code } }));
}
const profileReady = loadProfile();
void profileReady.then(profile => {
    for (const src of profile.preload)
        runDetached(loadBuffer(src), undefined, sequence);
}).catch(error => emitFault(error instanceof Error ? error.message : 'AUDIO_PROFILE_ERROR'));
async function runProfileHook(name, detail = {}) {
    try {
        const profile = await profileReady;
        const commands = profile.hooks[profileHookName(name, detail)] ?? [];
        for (const command of commands)
            await execute(command);
    }
    catch (error) {
        emitFault(error instanceof Error ? error.message : 'AUDIO_PROFILE_ERROR');
    }
}
function status() {
    const supported = !!(window.AudioContext || window.webkitAudioContext);
    return {
        ready: readyState,
        contextState: context?.state ?? (supported ? 'suspended' : 'unavailable'),
        bgmActive: !!bgmSource,
        seActive: seSources.size
    };
}
const ready = Promise.all([modules, profileReady]).then(() => {
    readyState = true;
    window.dispatchEvent(new CustomEvent('hanafuda-audio-driver-ready'));
}).then(() => undefined);
const api = Object.freeze({ ready, execute, activate, status });
window.hanafudaAudioDriver = api;
window.addEventListener(COMMAND_EVENT, event => {
    const detail = event.detail;
    void execute(detail).then(result => window.dispatchEvent(new CustomEvent(RESULT_EVENT, { detail: result })));
});
window.addEventListener('hanafuda-audio-hook', event => {
    const detail = event.detail ?? {};
    const name = typeof detail.name === 'string' ? detail.name : '';
    if (name)
        void runProfileHook(name, detail);
});
document.addEventListener('click', event => {
    const el = event.target instanceof Element ? event.target.closest('[data-action],[data-modal]') : null;
    if (!el)
        return;
    const action = el.dataset.action, modal = el.dataset.modal;
    if (action === 'pause') {
        void runProfileHook('pause-open');
        return;
    }
    if (modal === 'close') {
        void runProfileHook('pause-close');
        return;
    }
    if (modal)
        void runProfileHook('menu-select');
}, true);
const activateFromGesture = () => {
    void activate().then(ok => {
        if (!ok)
            return;
        document.removeEventListener('pointerdown', activateFromGesture, true);
        document.removeEventListener('keydown', activateFromGesture, true);
        document.removeEventListener('touchend', activateFromGesture, true);
    });
};
document.addEventListener('pointerdown', activateFromGesture, { capture: true, passive: true });
document.addEventListener('keydown', activateFromGesture, { capture: true });
document.addEventListener('touchend', activateFromGesture, { capture: true, passive: true });
window.addEventListener('pagehide', () => { void execute({ type: 'stop-all' }); });
