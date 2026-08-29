import {JSON_HEADERS,json,randomToken,bodyJson,validOpaqueToken,roomCode,parseRuleSet,ruleKey,validRoomCode} from "./gateway-common.js";

const QUEUE_TTL=120_000;

export class HanafudaDirectory {
  state:any;env:any;
  constructor(state:any,env:any){this.state=state;this.env=env;}

  async scheduleCleanup(at?:number){
    const target=Math.max(Date.now()+1,Number(at??Date.now()+QUEUE_TTL));
    const existing=Number(await this.state.storage.getAlarm()??0);
    if(!existing||target<existing)await this.state.storage.setAlarm(target);
  }

  async makeRoom(waitingTicket:string,currentTicket:string,rules:{rounds:number;koiEnabled:boolean}){
    for(let attempt=0;attempt<8;attempt++){
      const code=roomCode(),hostToken=randomToken(),guestToken=randomToken(),stub=this.env.ROOMS.get(this.env.ROOMS.idFromName(code));
      const create=await stub.fetch("https://room/create",{method:"POST",body:JSON.stringify({op:"create",hostToken,rules})});if(create.status===409)continue;if(!create.ok)return null;
      const join=await stub.fetch("https://room/join",{method:"POST",body:JSON.stringify({op:"join",guestToken})});if(!join.ok)return null;
      const expires=Date.now()+QUEUE_TTL;
      await this.state.storage.put(`match:${waitingTicket}`,{roomCode:code,token:hostToken,seat:"host",rules,expires});
      await this.state.storage.put(`ticketrule:${waitingTicket}`,{key:ruleKey(rules),expires});
      await this.scheduleCleanup(expires);
      return {roomCode:code,token:guestToken,seat:"guest",rules,expires};
    }
    return null;
  }

  async ticketRule(ticket:string){
    const raw:any=await this.state.storage.get(`ticketrule:${ticket}`);
    if(typeof raw==="string")return {key:raw,expires:0};
    if(raw&&typeof raw==="object")return {key:String(raw.key??""),expires:Number(raw.expires??0)};
    return {key:"",expires:0};
  }

  async fetch(req:Request){
    if(req.method!=="POST")return json({ok:false,code:"METHOD_NOT_ALLOWED"},405);
    let body:any;try{body=await bodyJson(req);}catch{return json({ok:false,code:"INVALID_JSON"},400);}
    const op=String(body?.op??""),ticket=String(body?.ticket??"");if(!validOpaqueToken(ticket))return json({ok:false,code:"INVALID_TICKET"},400);
    if(op==="enqueue"){
      const rules=parseRuleSet(body?.rules);if(!rules)return json({ok:false,code:"INVALID_RULESET"},400);const key=ruleKey(rules),waitKey=`waiting:${key}`,now=Date.now();
      const waiting:any=await this.state.storage.get(waitKey);
      if(waiting&&Number(waiting.expires)>now&&waiting.ticket!==ticket){
        const result=await this.makeRoom(waiting.ticket,ticket,rules);if(!result)return json({ok:false,code:"MATCH_CREATE_FAILED"},503);
        await this.state.storage.delete(waitKey);return json({ok:true,matched:true,...result});
      }
      const expires=now+QUEUE_TTL;
      await this.state.storage.put(waitKey,{ticket,expires});
      await this.state.storage.put(`ticketrule:${ticket}`,{key,expires});
      await this.scheduleCleanup(expires);
      return json({ok:true,matched:false,rules});
    }
    if(op==="poll"){
      const match:any=await this.state.storage.get(`match:${ticket}`);if(!match)return json({ok:true,matched:false});
      await this.state.storage.delete(`match:${ticket}`);await this.state.storage.delete(`ticketrule:${ticket}`);
      if(Number(match.expires)<=Date.now())return json({ok:true,matched:false});
      return json({ok:true,matched:true,roomCode:match.roomCode,token:match.token,seat:match.seat,rules:match.rules});
    }
    if(op==="cancel"){
      const ref=await this.ticketRule(ticket);if(ref.key){const waitKey=`waiting:${ref.key}`,waiting:any=await this.state.storage.get(waitKey);if(waiting?.ticket===ticket)await this.state.storage.delete(waitKey);}
      await this.state.storage.delete(`ticketrule:${ticket}`);await this.state.storage.delete(`match:${ticket}`);return json({ok:true});
    }
    return json({ok:false,code:"UNKNOWN_OPERATION"},404);
  }

  async alarm(){
    const now=Date.now();let next=0;
    for(const prefix of ["waiting:","match:","ticketrule:"]){
      const items:any=await this.state.storage.list({prefix,limit:1000});
      for(const [key,value] of items){
        const expires=Number((value as any)?.expires??0);
        if(expires>0&&expires<=now){
          if(prefix==="waiting:"){const ticket=String((value as any)?.ticket??"");if(ticket)await this.state.storage.delete(`ticketrule:${ticket}`);}
          await this.state.storage.delete(key);
        }else if(expires>now&&(next===0||expires<next))next=expires;
      }
    }
    if(next>0)await this.state.storage.setAlarm(Math.max(Date.now()+1,next));else await this.state.storage.deleteAlarm();
  }
}

export async function routeOnlineV3(req:Request,env:any,url:URL){
  if(url.pathname==="/api/online/inspect"&&req.method==="GET"){
    const code=String(url.searchParams.get("room")??"").toUpperCase();if(!validRoomCode(code))return json({ok:false,code:"INVALID_ROOM_CODE"},400);
    return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch("https://room/inspect",{method:"POST",body:JSON.stringify({op:"inspect"})});
  }
  if(url.pathname==="/api/online/random"&&req.method==="POST"){
    let body:any;try{body=await bodyJson(req);}catch{return json({ok:false,code:"INVALID_JSON"},400);}
    const supplied=String(body?.ticket??""),ticket=supplied||randomToken(),op=supplied?"poll":"enqueue";if(supplied&&!validOpaqueToken(supplied))return json({ok:false,code:"INVALID_TICKET"},400);
    const payload:any={op,ticket};if(op==="enqueue"){const rules=parseRuleSet(body?.rules);if(!rules)return json({ok:false,code:"INVALID_RULESET"},400);payload.rules=rules;}
    const response=await env.DIRECTORY.get(env.DIRECTORY.idFromName("global")).fetch("https://directory/",{method:"POST",body:JSON.stringify(payload)}),data=await response.json().catch(()=>null);
    return json({...data,queueTicket:ticket},response.status);
  }
  if(!["/api/online/action","/api/online/status","/api/online/postmatch","/api/online/reconfigure","/api/online/close"].includes(url.pathname))return null;
  if(req.method!=="POST")return json({ok:false,code:"METHOD_NOT_ALLOWED"},405);
  let body:any;try{body=await bodyJson(req);}catch{return json({ok:false,code:"INVALID_JSON"},400);}
  const code=String(body?.roomCode??"").toUpperCase(),token=String(body?.token??"");if(!validRoomCode(code)||!validOpaqueToken(token))return json({ok:false,code:"INVALID_SESSION"},400);
  const op=url.pathname.endsWith("/action")?"action":url.pathname.endsWith("/status")?"status":url.pathname.endsWith("/postmatch")?"postmatch":url.pathname.endsWith("/reconfigure")?"reconfigure":"close";
  const response=await env.ROOMS.get(env.ROOMS.idFromName(code)).fetch("https://room/op",{method:"POST",body:JSON.stringify({...body,op,token})});
  const text=await response.text();return new Response(text,{status:response.status,headers:JSON_HEADERS});
}
