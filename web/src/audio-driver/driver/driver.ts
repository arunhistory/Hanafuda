export const AUDIO_COMMAND={prepare:1,play:2,stop:3,stopAll:4,setVolume:5} as const;
export const AUDIO_CHANNEL={bgm:0,se:1} as const;

type DriverExports={
  driver_version:()=>number;
  driver_validate_command:(opcode:number)=>number;
  driver_validate_channel:(channel:number)=>number;
};

let modulePromise:Promise<DriverExports>|null=null;

export function loadDriverWasm(){
  if(modulePromise)return modulePromise;
  modulePromise=(async()=>{
    const url=new URL('./driver.wasm',import.meta.url);
    const response=await fetch(url,{cache:'force-cache',credentials:'same-origin'});
    if(!response.ok)throw new Error(`AUDIO_DRIVER_WASM_${response.status}`);
    const result=await WebAssembly.instantiate(await response.arrayBuffer(),{});
    const exports=result.instance.exports as unknown as DriverExports;
    if(exports.driver_version()!==1)throw new Error('AUDIO_DRIVER_VERSION_MISMATCH');
    return exports;
  })();
  return modulePromise;
}
