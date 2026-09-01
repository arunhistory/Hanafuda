let modulePromise = null;
export function loadCommonWasm() {
    if (modulePromise)
        return modulePromise;
    modulePromise = (async () => {
        const url = new URL('./common.wasm', import.meta.url);
        const response = await fetch(url, { cache: 'force-cache', credentials: 'same-origin' });
        if (!response.ok)
            throw new Error(`AUDIO_COMMON_WASM_${response.status}`);
        const result = await WebAssembly.instantiate(await response.arrayBuffer(), {});
        const exports = result.instance.exports;
        if (exports.common_version() !== 1)
            throw new Error('AUDIO_COMMON_VERSION_MISMATCH');
        return exports;
    })();
    return modulePromise;
}
