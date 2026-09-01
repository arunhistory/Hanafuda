// Cloudflare gateway extension. Existing mode behavior remains in worker-v2.
// TypeScript source; root JS modules are generated build artifacts.
// @ts-ignore - deployment uploads worker-v2.js beside generated worker-v3.js.
import baseWorker, { HanafudaModeSession as BaseModeSession } from "./worker-v2.js";
import {cors,engineCall,json} from "./gateway-common.js";
import {HanafudaCpuSessionDealer,routeCpuDealer} from "./cpu-session-dealer.js";
import {HanafudaOnlineRoom} from "./online-room.js";
import {HanafudaDirectory,routeOnlineV3} from "./directory.js";

export {BaseModeSession as HanafudaModeSession,HanafudaCpuSessionDealer as HanafudaCpuSession,HanafudaOnlineRoom,HanafudaDirectory};

// Developer test mode is activated only inside the server boundary.
// The browser never receives the developer secret; worker-v2 remains authoritative.
async function developerModeStartRequest(req:Request,env:any){
  const secret=typeof env.DEVELOPER_MODE_KEY==="string"?env.DEVELOPER_MODE_KEY:"";
  if(!secret)throw new Error("DEVELOPER_MODE_KEY_MISSING");
  let body:any;try{body=await req.json();}catch{body={};}
  const headers=new Headers(req.headers);
  headers.set("content-type","application/json");
  headers.set("x-hanafuda-developer",secret);
  return new Request(req.url,{method:"POST",headers,body:JSON.stringify({...body,developer:true})});
}

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
    if(url.pathname==="/api/mode/start"&&req.method==="POST"){
      try{return baseWorker.fetch(await developerModeStartRequest(req,env),env,ctx);}
      catch{return new Response(JSON.stringify({ok:false,code:"DEVELOPER_MODE_UNAVAILABLE"}),{status:503,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});}
    }
    if(url.pathname.startsWith("/api/cpu/"))return cors(await routeCpuDealer(req,env,url),req,env);
    if(url.pathname.startsWith("/api/online/")){const online=await routeOnlineV3(req,env,url);if(online)return cors(online,req,env);}
    return baseWorker.fetch(req,env,ctx);
  }
};
