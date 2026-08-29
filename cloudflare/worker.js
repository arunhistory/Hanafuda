import modeCore from "./mode_core.wasm";

const modeInstance = new WebAssembly.Instance(modeCore, {});
const shouldForceImpossible = modeInstance.exports.should_force_impossible;

const JSON_HEADERS = {"content-type":"application/json; charset=utf-8","cache-control":"no-store"};
const json = (value, status=200, extra={}) => new Response(JSON.stringify(value), {status, headers:{...JSON_HEADERS,...extra}});
const textEncoder = new TextEncoder();

function randomToken(bytes=32){
  const a=new Uint8Array(bytes); crypto.getRandomValues(a);
  return Array.from(a,b=>b.toString(16).padStart(2,"0")).join("");
}
async function sha256Hex(s){
  const d=new Uint8Array(await crypto.subtle.digest("SHA-256", textEncoder.encode(s)));
  return Array.from(d,b=>b.toString(16).padStart(2,"0")).join("");
}
function safeMode(v){return ["beginner","amateur","pro","impossible","online"].includes(v)?v:null;}
function modeCode(v){return v==="beginner"?0:v==="amateur"?1:v==="pro"?2:v==="impossible"?3:4;}
function parseRounds(v){const n=Number(v);return Number.isInteger(n)&&n>=1&&n<=12?n:null;}
function timingSafe(a,b){if(typeof a!=="string"||typeof b!=="string"||a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0;}
async function bodyJson(req,max=8192){const t=await req.text();if(t.length>max)throw new Error("REQUEST_TOO_LARGE");return JSON.parse(t);}

export class HanafudaModeSession {
  constructor(state, env){this.state=state;this.env=env;}
  async fetch(req){
    if(req.method!=="POST")return json({ok:false,code:"METHOD_NOT_ALLOWED"},405);
    let b;try{b=await bodyJson(req);}catch(e){return json({ok:false,code:e?.message==="REQUEST_TOO_LARGE"?"REQUEST_TOO_LARGE":"INVALID_JSON"},400);}
    const op=String(b?.op??"");
    if(op==="init") return this.init(b);
    const token=String(b?.token??"");
    const stored=await this.state.storage.get("tokenHash");
    if(!stored || !token || !timingSafe(await sha256Hex(token),stored))return json({ok:false,code:"UNAUTHORIZED"},401);
    if(op==="settlement") return this.settlement(b);
    if(op==="transition_ack") return this.transitionAck();
    if(op==="status") return this.status();
    return json({ok:false,code:"UNKNOWN_OPERATION"},404);
  }
  async init(b){
    if(await this.state.storage.get("initialized"))return json({ok:false,code:"ALREADY_INITIALIZED"},409);
    const mode=safeMode(String(b?.mode??"")); const rounds=parseRounds(b?.rounds);
    if(!mode||rounds===null||mode==="online")return json({ok:false,code:"INVALID_MODE"},400);
    const developer=b?.developer===true;
    const token=String(b?.token??""); if(!/^[a-f0-9]{64}$/.test(token))return json({ok:false,code:"INVALID_TOKEN"},400);
    await this.state.storage.put({initialized:true,tokenHash:await sha256Hex(token),mode,rounds,developer,phase:"active",transitionKind:0,forcedRounds:0,createdAt:Date.now()});
    return json({ok:true});
  }
  async settlement(b){
    const mode=await this.state.storage.get("mode"); const developer=(await this.state.storage.get("developer"))===true;
    const phase=await this.state.storage.get("phase");
    if(phase!=="active")return json({ok:true,transition:phase==="impossible_transition"?"impossible":null,forcedRounds:phase==="impossible_transition"?6:undefined});
    const roundWinner=String(b?.roundWinner??"");
    const winnerCode=roundWinner==="player"?0:roundWinner==="cpu"?1:2;
    const playerTotal=Number(b?.playerTotal), cpuTotal=Number(b?.cpuTotal), matchFinished=b?.matchFinished===true?1:0;
    if(!Number.isSafeInteger(playerTotal)||!Number.isSafeInteger(cpuTotal)||playerTotal<0||cpuTotal<0)return json({ok:false,code:"INVALID_SCORE"},400);
    const result=Number(shouldForceImpossible(modeCode(mode), developer?1:0, matchFinished, winnerCode, playerTotal, cpuTotal));
    if(result===1||result===2){
      await this.state.storage.put({phase:"impossible_transition",transitionKind:result,forcedRounds:6,transitionAt:Date.now()});
      return json({ok:true,transition:"impossible",forcedRounds:6,unskippable:true});
    }
    return json({ok:true,transition:null});
  }
  async transitionAck(){
    const phase=await this.state.storage.get("phase");
    if(phase!=="impossible_transition")return json({ok:false,code:"NO_PENDING_TRANSITION"},409);
    await this.state.storage.put({mode:"impossible",rounds:6,phase:"active",developer:false,forcedRounds:6,transitionAcceptedAt:Date.now()});
    return json({ok:true,mode:"impossible",rounds:6});
  }
  async status(){
    const d=await this.state.storage.get(["mode","rounds","developer","phase","forcedRounds"]);
    return json({ok:true,mode:d.get("mode"),rounds:d.get("rounds"),developer:d.get("developer")===true,phase:d.get("phase"),forcedRounds:d.get("forcedRounds")??0});
  }
}

export class HanafudaOnlineRoom {
  constructor(state, env){this.state=state;this.env=env;this.sockets=new Map();}
  async fetch(req){
    const u=new URL(req.url);
    if(req.method==="POST"){
      let b;try{b=await bodyJson(req);}catch{return json({ok:false,code:"INVALID_JSON"},400);}
      if(b?.op==="create")return this.create(b);
      if(b?.op==="join")return this.join(b);
      if(b?.op==="turn")return this.turnSignal(req,b);
      if(b?.op==="close")return this.closeRoom(req,b);
      return json({ok:false,code:"UNKNOWN_OPERATION"},404);
    }
    if(req.method==="GET"&&u.pathname.endsWith("/connect"))return this.connect(req,u);
    return json({ok:false,code:"METHOD_NOT_ALLOWED"},405);
  }
  async create(b){
    if(await this.state.storage.get("initialized"))return json({ok:false,code:"ROOM_EXISTS"},409);
    const hostToken=String(b?.hostToken??""); const rules=b?.rules;
    if(!/^[a-f0-9]{64}$/.test(hostToken)||!rules||typeof rules!=="object")return json({ok:false,code:"INVALID_REQUEST"},400);
    await this.state.storage.put({initialized:true,status:"waiting",hostHash:await sha256Hex(hostToken),guestHash:null,rules,turnDeadline:0,graceDeadline:0,disconnectHost:0,disconnectGuest:0,createdAt:Date.now()});
    return json({ok:true,rules});
  }
  async join(b){
    if((await this.state.storage.get("status"))!=="waiting")return json({ok:false,code:"ROOM_NOT_JOINABLE"},409);
    const guestToken=String(b?.guestToken??""); if(!/^[a-f0-9]{64}$/.test(guestToken))return json({ok:false,code:"INVALID_TOKEN"},400);
    await this.state.storage.put({guestHash:await sha256Hex(guestToken),status:"active"});
    return json({ok:true,rules:await this.state.storage.get("rules")});
  }
  async authSeat(token){
    const h=await sha256Hex(token);const host=await this.state.storage.get("hostHash"),guest=await this.state.storage.get("guestHash");
    if(host&&timingSafe(h,host))return "host"; if(guest&&timingSafe(h,guest))return "guest"; return null;
  }
  async connect(req,u){
    if(req.headers.get("Upgrade")!=="websocket")return json({ok:false,code:"UPGRADE_REQUIRED"},426);
    const token=u.searchParams.get("token")??""; const seat=await this.authSeat(token); if(!seat)return json({ok:false,code:"UNAUTHORIZED"},401);
    if((await this.state.storage.get("status"))==="timeout"||(await this.state.storage.get("status"))==="closed")return json({ok:false,code:"ROOM_CLOSED"},410);
    const pair=new WebSocketPair(); const client=pair[0],server=pair[1]; server.accept();
    const prior=this.sockets.get(seat); try{prior?.close(4001,"replaced");}catch{}
    this.sockets.set(seat,server);
    await this.state.storage.put(seat==="host"?"disconnectHost":"disconnectGuest",0);
    await this.scheduleNextAlarm();
    server.addEventListener("message",ev=>this.onMessage(seat,ev));
    server.addEventListener("close",()=>this.onDisconnect(seat));
    server.addEventListener("error",()=>this.onDisconnect(seat));
    server.send(JSON.stringify({type:"connected",seat,status:await this.state.storage.get("status"),rules:await this.state.storage.get("rules")}));
    return new Response(null,{status:101,webSocket:client});
  }
  async onMessage(seat,ev){
    let m;try{m=JSON.parse(String(ev.data));}catch{return;}
    if(m?.type==="relay"&&typeof m?.payload!=="undefined")this.broadcast({type:"relay",from:seat,payload:m.payload},seat);
    if(m?.type==="ping")this.sockets.get(seat)?.send(JSON.stringify({type:"pong",t:Date.now()}));
  }
  broadcast(v,except=null){const s=JSON.stringify(v);for(const [seat,ws] of this.sockets){if(seat===except)continue;try{ws.send(s);}catch{}}}
  async onDisconnect(seat){
    if(this.sockets.get(seat)){this.sockets.delete(seat);}
    if((await this.state.storage.get("status"))!=="active")return;
    const deadline=Date.now()+60_000; await this.state.storage.put(seat==="host"?"disconnectHost":"disconnectGuest",deadline); await this.scheduleNextAlarm();
    this.broadcast({type:"disconnect",seat,reconnectSeconds:60});
  }
  async internalAuthorized(req){const got=req.headers.get("x-hanafuda-internal")??"";return timingSafe(got,this.env.HANA_INTERNAL??"");}
  async turnSignal(req,b){
    if(!(await this.internalAuthorized(req)))return json({ok:false,code:"UNAUTHORIZED"},401);
    if((await this.state.storage.get("status"))!=="active")return json({ok:false,code:"ROOM_NOT_ACTIVE"},409);
    const phase=String(b?.phase??"");
    if(phase==="start")await this.state.storage.put({turnDeadline:Date.now()+60_000,graceDeadline:0});
    else if(phase==="clear")await this.state.storage.put({turnDeadline:0,graceDeadline:0});
    else return json({ok:false,code:"INVALID_PHASE"},400);
    await this.scheduleNextAlarm(); return json({ok:true});
  }
  async closeRoom(req,b){
    if(!(await this.internalAuthorized(req)))return json({ok:false,code:"UNAUTHORIZED"},401);
    await this.state.storage.put({status:"closed",turnDeadline:0,graceDeadline:0,disconnectHost:0,disconnectGuest:0});
    this.broadcast({type:"closed",reason:String(b?.reason??"complete")}); for(const ws of this.sockets.values())try{ws.close(1000,"closed");}catch{} this.sockets.clear();
    return json({ok:true});
  }
  async scheduleNextAlarm(){
    const d=await this.state.storage.get(["turnDeadline","graceDeadline","disconnectHost","disconnectGuest","status"]);
    if(d.get("status")!=="active"){await this.state.storage.deleteAlarm();return;}
    const vals=[d.get("turnDeadline"),d.get("graceDeadline"),d.get("disconnectHost"),d.get("disconnectGuest")].filter(x=>Number(x)>0).map(Number);
    if(!vals.length){await this.state.storage.deleteAlarm();return;}
    await this.state.storage.setAlarm(Math.max(Date.now()+1,Math.min(...vals)));
  }
  async alarm(){
    if((await this.state.storage.get("status"))!=="active")return;
    const now=Date.now(); const d=await this.state.storage.get(["turnDeadline","graceDeadline","disconnectHost","disconnectGuest"]);
    const dh=Number(d.get("disconnectHost")||0),dg=Number(d.get("disconnectGuest")||0),td=Number(d.get("turnDeadline")||0),gd=Number(d.get("graceDeadline")||0);
    if((dh&&dh<=now)||(dg&&dg<=now)){
      await this.state.storage.put({status:"timeout",turnDeadline:0,graceDeadline:0,disconnectHost:0,disconnectGuest:0});this.broadcast({type:"timeout",reason:"disconnect_timeout"});return;
    }
    if(gd&&gd<=now){await this.state.storage.put({status:"timeout",turnDeadline:0,graceDeadline:0});this.broadcast({type:"timeout",reason:"turn_timeout"});return;}
    if(td&&td<=now){await this.state.storage.put({turnDeadline:0,graceDeadline:now+30_000});this.broadcast({type:"turn_warning",graceSeconds:30});}
    await this.scheduleNextAlarm();
  }
}

export class HanafudaDirectory {
  constructor(state, env){this.state=state;this.env=env;}
  async fetch(req){
    if(req.method!=="POST")return json({ok:false,code:"METHOD_NOT_ALLOWED"},405);
    let b;try{b=await bodyJson(req);}catch{return json({ok:false,code:"INVALID_JSON"},400);}
    const op=String(b?.op??"");
    if(op==="enqueue"){
      const token=String(b?.token??"");if(!/^[a-f0-9]{64}$/.test(token))return json({ok:false,code:"INVALID_TOKEN"},400);
      const q=await this.state.storage.get("queue")??[];const now=Date.now();const live=q.filter(x=>x.expires>now&&x.token!==token);
      if(live.length){const peer=live.shift();await this.state.storage.put("queue",live);return json({ok:true,matched:true,peerToken:peer.token});}
      live.push({token,expires:now+120_000});await this.state.storage.put("queue",live);return json({ok:true,matched:false});
    }
    if(op==="cancel"){
      const token=String(b?.token??"");const q=await this.state.storage.get("queue")??[];await this.state.storage.put("queue",q.filter(x=>x.token!==token));return json({ok:true});
    }
    return json({ok:false,code:"UNKNOWN_OPERATION"},404);
  }
}

async function routeMode(req, env, u){
  if(req.method!=="POST")return json({ok:false,code:"METHOD_NOT_ALLOWED"},405);
  let b;try{b=await bodyJson(req);}catch{return json({ok:false,code:"INVALID_JSON"},400);}
  if(u.pathname==="/api/mode/start"){
    const mode=safeMode(String(b?.mode??"")); const rounds=parseRounds(b?.rounds); if(!mode||mode==="online"||rounds===null)return json({ok:false,code:"INVALID_MODE"},400);
    const developer=b?.developer===true;
    if(developer){const got=req.headers.get("x-hanafuda-developer")??"";if(!timingSafe(got,env.DEVELOPER_MODE_KEY??""))return json({ok:false,code:"DEVELOPER_MODE_UNAUTHORIZED"},401);}
    const id=env.MODE_SESSIONS.newUniqueId();const token=randomToken();const stub=env.MODE_SESSIONS.get(id);
    const r=await stub.fetch("https://mode/init",{method:"POST",body:JSON.stringify({op:"init",mode,rounds,developer,token})}); if(!r.ok)return r;
    return json({ok:true,sessionId:id.toString(),token,mode,rounds,developer});
  }
  const sessionId=String(b?.sessionId??""); if(!/^[a-f0-9]{64}$/.test(sessionId))return json({ok:false,code:"INVALID_SESSION"},400);
  let id;try{id=env.MODE_SESSIONS.idFromString(sessionId);}catch{return json({ok:false,code:"INVALID_SESSION"},400);}
  const stub=env.MODE_SESSIONS.get(id);
  const op=u.pathname==="/api/mode/settlement"?"settlement":u.pathname==="/api/mode/transition-ack"?"transition_ack":u.pathname==="/api/mode/status"?"status":null;
  if(!op)return json({ok:false,code:"NOT_FOUND"},404);
  return stub.fetch("https://mode/op",{method:"POST",body:JSON.stringify({...b,op})});
}

async function routeOnline(req,env,u){
  if(u.pathname==="/api/online/create"&&req.method==="POST"){
    let b;try{b=await bodyJson(req);}catch{return json({ok:false,code:"INVALID_JSON"},400);}
    const roomCode=randomToken(4).slice(0,6).toUpperCase().replace(/[01OIL]/g,"A"); const hostToken=randomToken(); const id=env.ROOMS.idFromName(roomCode);const stub=env.ROOMS.get(id);
    const r=await stub.fetch("https://room/create",{method:"POST",body:JSON.stringify({op:"create",hostToken,rules:b?.rules??{}})}); if(!r.ok)return r;
    return json({ok:true,roomCode,hostToken,rules:b?.rules??{}});
  }
  if(u.pathname==="/api/online/join"&&req.method==="POST"){
    let b;try{b=await bodyJson(req);}catch{return json({ok:false,code:"INVALID_JSON"},400);}
    const roomCode=String(b?.roomCode??"").toUpperCase();if(!/^[A-Z2-9]{6}$/.test(roomCode))return json({ok:false,code:"INVALID_ROOM_CODE"},400);
    const guestToken=randomToken();const stub=env.ROOMS.get(env.ROOMS.idFromName(roomCode));const r=await stub.fetch("https://room/join",{method:"POST",body:JSON.stringify({op:"join",guestToken})});const data=await r.text();return new Response(r.ok?JSON.stringify({...JSON.parse(data),roomCode,guestToken}):data,{status:r.status,headers:JSON_HEADERS});
  }
  if(u.pathname==="/api/online/connect"&&req.method==="GET"){
    const roomCode=(u.searchParams.get("room")??"").toUpperCase();if(!/^[A-Z2-9]{6}$/.test(roomCode))return json({ok:false,code:"INVALID_ROOM_CODE"},400);
    const stub=env.ROOMS.get(env.ROOMS.idFromName(roomCode));const target=new URL(req.url);target.pathname="/connect";return stub.fetch(new Request(target.toString(),req));
  }
  if(u.pathname==="/api/online/random"&&req.method==="POST"){
    const token=randomToken();const stub=env.DIRECTORY.get(env.DIRECTORY.idFromName("global"));const r=await stub.fetch("https://directory/",{method:"POST",body:JSON.stringify({op:"enqueue",token})});const d=await r.json();return json({...d,queueToken:token});
  }
  return json({ok:false,code:"NOT_FOUND"},404);
}

export default {
  async fetch(req, env){
    const u=new URL(req.url);
    if(u.pathname==="/health")return json({ok:true,service:"hanafuda-system",modeVersion:Number(modeInstance.exports.hanafuda_mode_version())});
    if(u.pathname.startsWith("/api/mode/"))return routeMode(req,env,u);
    if(u.pathname.startsWith("/api/online/"))return routeOnline(req,env,u);
    return json({ok:false,code:"NOT_FOUND"},404);
  }
};
