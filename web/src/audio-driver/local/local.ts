type LocalExports={
  local_version:()=>number;
  local_global_token:()=>number;
  local_invalidate_all:()=>number;
  local_is_global_current:(token:number)=>number;
  local_next_bgm:()=>number;
  local_bgm_token:()=>number;
  local_is_bgm_current:(token:number)=>number;
  local_se_token:()=>number;
  local_invalidate_se:()=>number;
  local_is_se_current:(token:number)=>number;
  local_set_bgm:(id:number)=>void;
  local_get_bgm:()=>number;
  local_clear_bgm:()=>void;
};

let modulePromise:Promise<LocalExports>|null=null;

export function loadLocalWasm(){
  if(modulePromise)return modulePromise;
  modulePromise=(async()=>{
    const url=new URL('./local.wasm',import.meta.url);
    const response=await fetch(url,{cache:'force-cache',credentials:'same-origin'});
    if(!response.ok)throw new Error(`AUDIO_LOCAL_WASM_${response.status}`);
    const result=await WebAssembly.instantiate(await response.arrayBuffer(),{});
    const exports=result.instance.exports as unknown as LocalExports;
    if(exports.local_version()!==1)throw new Error('AUDIO_LOCAL_VERSION_MISMATCH');
    return exports;
  })();
  return modulePromise;
}
