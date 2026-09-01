import { AUDIO_CHANNEL, AUDIO_COMMAND, loadDriverWasm } from './driver/driver.js';
import { loadCommonWasm } from './common/common.js';
import { loadLocalWasm } from './local/local.js';
const STORAGE_ORIGIN = 'https://mpuhgfbdkxmhynytwhzu.supabase.co';
const PUBLIC_STORAGE_PREFIX = '/storage/v1/object/public/';
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
function status() {
    const supported = !!(window.AudioContext || window.webkitAudioContext);
    return {
        ready: readyState,
        contextState: context?.state ?? (supported ? 'suspended' : 'unavailable'),
        bgmActive: !!bgmSource,
        seActive: seSources.size
    };
}
const ready = modules.then(() => {
    readyState = true;
    window.dispatchEvent(new CustomEvent('hanafuda-audio-driver-ready'));
});
const api = Object.freeze({ ready, execute, activate, status });
window.hanafudaAudioDriver = api;
window.addEventListener(COMMAND_EVENT, event => {
    const detail = event.detail;
    void execute(detail).then(result => window.dispatchEvent(new CustomEvent(RESULT_EVENT, { detail: result })));
});
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
