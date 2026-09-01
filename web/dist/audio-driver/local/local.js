let modulePromise = null;
export function loadLocalWasm() {
    if (modulePromise)
        return modulePromise;
    modulePromise = (async () => {
        const url = new URL('./local.wasm', import.meta.url);
        const response = await fetch(url, { cache: 'force-cache', credentials: 'same-origin' });
        if (!response.ok)
            throw new Error(`AUDIO_LOCAL_WASM_${response.status}`);
        const result = await WebAssembly.instantiate(await response.arrayBuffer(), {});
        const exports = result.instance.exports;
        if (exports.local_version() !== 1)
            throw new Error('AUDIO_LOCAL_VERSION_MISMATCH');
        return exports;
    })();
    return modulePromise;
}
