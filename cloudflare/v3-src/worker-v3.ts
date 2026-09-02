// Cloudflare gateway extension. Existing mode behavior remains in worker-v2.
// TypeScript source; root JS modules are generated build artifacts.
// @ts-ignore - deployment uploads worker-v2.js beside generated worker-v3.js.
import baseWorker, { HanafudaModeSession as BaseModeSession } from "./worker-v2.js";
import {cors,engineCall,json} from "./gateway-common.js";
import {HanafudaCpuSessionDealer,routeCpuDealer} from "./cpu-session-dealer.js";
import {HanafudaOnlineRoom} from "./online-room.js";
import {HanafudaDirectory,routeOnlineV3} from "./directory.js";

export {BaseModeSession as HanafudaModeSession,HanafudaCpuSessionDealer as HanafudaCpuSession,HanafudaOnlineRoom,HanafudaDirectory};

async function audioProfile(req:Request,env:any){
  if(req.method!=="GET")return cors(json({ok:false,code:"METHOD_NOT_ALLOWED"},405),req,env);
  try{
    const result=await engineCall(env,{op:"audio_profile"});
    if(!result.ok||result.data?.ok!==true||!result.data?.profile)return cors(json({ok:false,code:"AUDIO_PROFILE_UNAVAILABLE"},502),req,env);
    return cors(json({ok:true,profile:result.data.profile}),req,env);
  }catch{
    return cors(json({ok:false,code:"AUDIO_PROFILE_UNAVAILABLE"},502),req,env);
  }
}

export default {
  async fetch(req:Request,env:any,ctx:any){
    const url=new URL(req.url);
    if(req.method==="OPTIONS")return baseWorker.fetch(req,env,ctx);
    if(url.pathname==="/api/audio/profile")return audioProfile(req,env);
    if(url.pathname.startsWith("/api/cpu/"))return cors(await routeCpuDealer(req,env,url),req,env);
    if(url.pathname.startsWith("/api/online/")){const online=await routeOnlineV3(req,env,url);if(online)return cors(online,req,env);}
    return baseWorker.fetch(req,env,ctx);
  }
};
