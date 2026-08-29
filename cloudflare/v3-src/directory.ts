import {JSON_HEADERS,json,randomToken,bodyJson,validOpaqueToken,roomCode,parseRuleSet,ruleKey,validRoomCode} from "./gateway-common.js";
declare const WebSocketPair:any;

const QUEUE_TTL=120_000;

type Rules={rounds:number;koiEnabled:boolean};
type WaitingRecord={ticket:string;expires:number};
type MatchRoom={roomCode:string;hostToken:string;guestToken:string;rules:Rules};
type SocketAttachment={ticket:string;waitKey:string};

export class HanafudaDirectory {
  state:any;env:any;
  constructor(state:any,env:any){this.state=state;this.env=env;}

  async scheduleCleanup(at?:number){
    const target=Math.max(Date.now()+1,Number(at??Date.now()+QUEUE_TTL));
    const existing=Number(await this.state.storage.getAlarm()??0);
    if(!existing||target<existing)await this.state.storage.setAlarm(target);
  }

  async createRoom(rules:Rules):Promise<MatchRoom|null>{
    for(let attempt=0;attempt<8;attempt++){
      const code=roomCode(),hostToken=randomToken(),guestToken=randomToken(),stub=this.env.ROOMS.get(this.env.ROOMS.idFromName(code));
      const create=await stub.fetch("https://room/create",{method:"POST",body:JSON.stringify({op:"create",hostToken,rules})});
      if(create.status===409)continue;
      if(!create.ok)return null;
      const join=await stub.fetch("https://room/join",{method:"POST",body:JSON.stringify({op:"join",guestToken})});
      if(!join.ok){
        await stub.fetch("https://room/op",{method:"POST",body:JSON.stringify({op:"close",token:hostToken,reason:"matchmaking_join_failed"})}).catch(()=>null);
        return null;
      }
      return {roomCode:code,hostToken,guestToken,rules};
    }
    return null;
  }

  send(socket:any,value:any){try{socket.send(JSON.stringify(value));return true;}catch{return false;}}
  socketFor(ticket:string){const sockets=this.state.getWebSockets(`ticket:${ticket}`);return Array.isArray(sockets)&&sockets.length?sockets[0]:null;}
  attachment(socket:any):SocketAttachment|null{
    try{const a=socket.deserializeAttachment?.();if(a&&typeof a.ticket==="string"&&typeof a.waitKey==="string")return {ticket:a.ticket,waitKey:a.waitKey};}catch{}
    try{const tags:string[]=this.state.getTags(socket);const ticket=tags.find(t=>t.startsWith("ticket:"))?.slice(7)??"",rule=tags.find(t=>t.startsWith("rule:"))?.slice(5)??"";if(ticket&&rule)return {ticket,waitKey:`waiting:${rule}`};}catch{}
    return null;
  }

  async dropWaiting(ticket:string,waitKey:string,socket:any,closeCode?:number,closeReason?:string){
    const waiting:any=await this.state.storage.get(waitKey);if(waiting?.ticket===ticket)await this.state.storage.delete(waitKey);
    if(closeCode){try{socket.close(closeCode,closeReason??"closed");}catch{}}
    await this.rescheduleFromStorage();
  }

  async rescheduleFromStorage(){
    const items:any=await this.state.storage.list({prefix:"waiting:",limit:1000});let next=0;const now=Date.now();
    for(const [,value] of items){const expires=Number((value as any)?.expires??0);if(expires>now&&(next===0||expires<next))next=expires;}
    if(next>0)await this.state.storage.setAlarm(Math.max(Date.now()+1,next));else await this.state.storage.deleteAlarm();
  }

  parseRulesFromUrl(url:URL):Rules|null{
    const rounds=Number(url.searchParams.get("rounds")),rawKoi=url.searchParams.get("koiEnabled");if(rawKoi!=="true"&&rawKoi!=="false")return null;
    return parseRuleSet({rounds,koiEnabled:rawKoi==="true"});
  }

  async connect(req:Request,url:URL){
    if(req.headers.get("Upgrade")!=="websocket")return json({ok:false,code:"UPGRADE_REQUIRED"},426);
    const rules=this.parseRulesFromUrl(url);if(!rules)return json({ok:false,code:"INVALID_RULESET"},400);
    const pair=new WebSocketPair(),client=pair[0],server=pair[1],ticket=randomToken(),key=ruleKey(rules),waitKey=`waiting:${key}`;
    this.state.acceptWebSocket(server,[`ticket:${ticket}`,`rule:${key}`]);server.serializeAttachment({ticket,waitKey});

    const now=Date.now();const waiting=await this.state.storage.get(waitKey) as WaitingRecord|undefined;
    if(waiting&&waiting.expires>now&&waiting.ticket!==ticket){
      const peer=this.socketFor(waiting.ticket);
      if(peer){
        const room=await this.createRoom(rules);
        if(!room){
          this.send(peer,{type:"error",code:"MATCH_CREATE_FAILED"});this.send(server,{type:"error",code:"MATCH_CREATE_FAILED"});
          await this.dropWaiting(waiting.ticket,waitKey,peer,1011,"match_create_failed");await this.dropWaiting(ticket,waitKey,server,1011,"match_create_failed");
          return new Response(null,{status:101,webSocket:client} as any);
        }
        await this.state.storage.delete(waitKey);
        const hostOk=this.send(peer,{type:"matched",roomCode:room.roomCode,token:room.hostToken,seat:"host",rules:room.rules});
        const guestOk=this.send(server,{type:"matched",roomCode:room.roomCode,token:room.guestToken,seat:"guest",rules:room.rules});
        if(!hostOk||!guestOk){
          const stub=this.env.ROOMS.get(this.env.ROOMS.idFromName(room.roomCode));await stub.fetch("https://room/op",{method:"POST",body:JSON.stringify({op:"close",token:room.hostToken,reason:"matchmaking_peer_lost"})}).catch(()=>null);
          if(hostOk)this.send(peer,{type:"error",code:"MATCH_PEER_LOST"});if(guestOk)this.send(server,{type:"error",code:"MATCH_PEER_LOST"});
          try{peer.close(1011,"peer_lost");}catch{}try{server.close(1011,"peer_lost");}catch{}
        }else{try{peer.close(1000,"matched");}catch{}try{server.close(1000,"matched");}catch{}}
        await this.rescheduleFromStorage();return new Response(null,{status:101,webSocket:client} as any);
      }
      await this.state.storage.delete(waitKey);
    }

    const expires=now+QUEUE_TTL;await this.state.storage.put(waitKey,{ticket,expires});await this.scheduleCleanup(expires);this.send(server,{type:"queued",ticket,rules,expires});
    return new Response(null,{status:101,webSocket:client} as any);
  }

  async fetch(req:Request){const url=new URL(req.url);if(req.method==="GET"&&url.pathname.endsWith("/connect"))return this.connect(req,url);return json({ok:false,code:"METHOD_NOT_ALLOWED"},405);}

  async webSocketMessage(socket:any,message:any){
    let m:any;try{const text=typeof message==="string"?message:new TextDecoder().decode(message);m=JSON.parse(text);}catch{return;}
    if(m?.type==="ping"){this.send(socket,{type:"pong",t:Date.now()});return;}
    if(m?.type==="cancel"){const a=this.attachment(socket);if(a)await this.dropWaiting(a.ticket,a.waitKey,socket,1000,"cancelled");}
  }
  async webSocketClose(socket:any){const a=this.attachment(socket);if(a)await this.dropWaiting(a.ticket,a.waitKey,socket);}
  async webSocketError(socket:any){const a=this.attachment(socket);if(a)await this.dropWaiting(a.ticket,a.waitKey,socket);}

  async alarm(){
    const now=Date.now();let next=0;const items:any=await this.state.storage.list({prefix:"waiting:",limit:1000});
    for(const [key,value] of items){const ticket=String((value as any)?.ticket??""),expires=Number((value as any)?.expires??0);
      if(expires>0&&expires<=now){await this.state.storage.delete(key);const socket=this.socketFor(ticket);if(socket){this.send(socket,{type:"timeout",code:"MATCHMAKING_TIMEOUT"});try{socket.close(4000,"matchmaking_timeout");}catch{}}}
      else if(expires>now&&(next===0||expires<next))next=expires;
    }
    if(next>0)await this.state.storage.setAlarm(Math.max(Date.now()+1,next));else await this.state.storage.deleteAlarm();
  }
}

export async function routeOnlineV3(req:Request,env:any,url:URL){
  if(url.pathname==="/api/online/inspect"&&req.method==="GET"){
    const code=String(url.searchParams.get("room")??"").toUpperCase();if(!validRoomCode(code))return json({ok:false,code:"INVALID_ROOM_CODE"},400);
    return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch("https://room/inspect",{method:"POST",body:JSON.stringify({op:"inspect"})});
  }
  if(url.pathname==="/api/online/random/connect"){
    if(req.method!=="GET")return json({ok:false,code:"METHOD_NOT_ALLOWED"},405);
    const target=new URL(req.url);target.pathname="/connect";return env.DIRECTORY.get(env.DIRECTORY.idFromName("global")).fetch(new Request(target.toString(),req));
  }
  if(url.pathname==="/api/online/random")return json({ok:false,code:"MATCHMAKING_WEBSOCKET_REQUIRED"},410);
  if(!["/api/online/action","/api/online/status","/api/online/postmatch","/api/online/reconfigure","/api/online/close"].includes(url.pathname))return null;
  if(req.method!=="POST")return json({ok:false,code:"METHOD_NOT_ALLOWED"},405);
  let body:any;try{body=await bodyJson(req);}catch{return json({ok:false,code:"INVALID_JSON"},400);}
  const code=String(body?.roomCode??"").toUpperCase(),token=String(body?.token??"");if(!validRoomCode(code)||!validOpaqueToken(token))return json({ok:false,code:"INVALID_SESSION"},400);
  const op=url.pathname.endsWith("/action")?"action":url.pathname.endsWith("/status")?"status":url.pathname.endsWith("/postmatch")?"postmatch":url.pathname.endsWith("/reconfigure")?"reconfigure":"close";
  const response=await env.ROOMS.get(env.ROOMS.idFromName(code)).fetch("https://room/op",{method:"POST",body:JSON.stringify({...body,op,token})});const text=await response.text();return new Response(text,{status:response.status,headers:JSON_HEADERS});
}
