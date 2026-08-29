export const JSON_HEADERS = {"content-type":"application/json; charset=utf-8","cache-control":"no-store"};
export const CPU_PHASES = new Set([1,2,3,4]);
export const ONLINE_ACTIVE_PHASES = new Set([1,2,3,4]);
export const ROOM_ALPHABET="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const json = (value:any,status=200)=>new Response(JSON.stringify(value),{status,headers:JSON_HEADERS});

export function cors(response:Response,req:Request,env:any){
  const origin=req.headers.get("Origin");
  if(!origin||origin!==env.APP_ORIGIN)return response;
  const headers=new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin",origin);
  headers.set("Vary","Origin");
  headers.set("Access-Control-Allow-Headers","content-type");
  headers.set("Access-Control-Allow-Methods","GET,POST,OPTIONS");
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
export function randomToken(bytes=32){const a=new Uint8Array(bytes);crypto.getRandomValues(a);return Array.from(a,b=>b.toString(16).padStart(2,"0")).join("");}
export async function sha256Hex(s:string){const d=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)));return Array.from(d,b=>b.toString(16).padStart(2,"0")).join("");}
export function timingSafe(a:string,b:string){if(!a||!b||a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0;}
export async function bodyJson(req:Request,max=8192){const text=await req.text();if(text.length>max)throw new Error("REQUEST_TOO_LARGE");return JSON.parse(text);}
export function safeMode(v:string){return ["beginner","amateur","pro"].includes(v)?v:null;}
export function safeCpuMode(v:string){return ["beginner","amateur","pro","impossible"].includes(v)?v:null;}
export function modeCode(v:string){return v==="beginner"?0:v==="amateur"?1:v==="pro"?2:3;}
export function parseRounds(v:any){const n=Number(v);return Number.isInteger(n)&&n>=1&&n<=12?n:null;}
export function validOpaqueToken(v:string){return /^[a-f0-9]{64}$/.test(v);}
export function roomCode(){const a=new Uint8Array(6);crypto.getRandomValues(a);let s="";for(const b of a)s+=ROOM_ALPHABET[b%ROOM_ALPHABET.length];return s;}
export function parseRuleSet(v:any){
  if(!v||typeof v!=="object"||Array.isArray(v))return null;
  const keys=Object.keys(v);if(keys.some(k=>k!=="rounds"&&k!=="koiEnabled"))return null;
  const rounds=parseRounds(v.rounds);if(rounds===null||typeof v.koiEnabled!=="boolean")return null;
  return {rounds,koiEnabled:v.koiEnabled};
}
export function ruleKey(r:{rounds:number;koiEnabled:boolean}){return `${r.rounds}:${r.koiEnabled?1:0}`;}
export function validRoomCode(v:string){return /^[A-Z2-9]{6}$/.test(v);}
export function roomStatusForPhase(phase:number){return phase===5?"round_settlement":phase===6?"complete":"active";}

export async function engineCall(env:any,payload:any){
  const mainUrl=String(env.SUPABASE_ENGINE_URL??"");
  const closeUrl=String(env.SUPABASE_ENGINE_CLOSE_URL??"");
  const url=payload?.op==="close"?(closeUrl||mainUrl):mainUrl;
  const internal=String(env.HANA_INTERNAL??"");
  if(!url||!internal)throw new Error("ENGINE_BINDING_MISSING");
  const response=await fetch(url,{method:"POST",headers:{"content-type":"application/json","x-hanafuda-internal":internal},body:JSON.stringify(payload)});
  const data=await response.json().catch(()=>null);
  return {ok:response.ok,status:response.status,data};
}
