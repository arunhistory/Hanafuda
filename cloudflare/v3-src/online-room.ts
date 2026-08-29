import {ONLINE_ACTIVE_PHASES,json,randomToken,sha256Hex,timingSafe,bodyJson,validOpaqueToken,parseRuleSet,engineCall,roomStatusForPhase} from "./gateway-common.js";
declare const WebSocketPair:any;

const LIVE_ROOM_STATES=new Set(["starting","active","round_settlement","complete","reconfiguring"]);

export class HanafudaOnlineRoom {
  state:any; env:any; sockets:Map<number,any>;
  constructor(state:any,env:any){this.state=state;this.env=env;this.sockets=new Map();}

  async fetch(req:Request){
    const url=new URL(req.url);
    if(req.method==="GET"&&url.pathname.endsWith("/connect"))return this.connect(req,url);
    if(req.method!=="POST")return json({ok:false,code:"METHOD_NOT_ALLOWED"},405);
    let body:any;try{body=await bodyJson(req);}catch(e:any){return json({ok:false,code:e?.message==="REQUEST_TOO_LARGE"?"REQUEST_TOO_LARGE":"INVALID_JSON"},400);}
    const op=String(body?.op??"");
    if(op==="create")return this.create(body);
    if(op==="inspect")return this.inspect();
    if(op==="join")return this.join(body);
    if(op==="action")return this.action(body);
    if(op==="status")return this.status(body);
    if(op==="postmatch")return this.postmatch(body);
    if(op==="reconfigure")return this.reconfigure(body);
    if(op==="close")return this.close(body);
    return json({ok:false,code:"UNKNOWN_OPERATION"},404);
  }

  async create(body:any){
    if(await this.state.storage.get("initialized"))return json({ok:false,code:"ROOM_EXISTS"},409);
    const hostToken=String(body?.hostToken??""),rules=parseRuleSet(body?.rules);
    if(!validOpaqueToken(hostToken)||!rules)return json({ok:false,code:"INVALID_REQUEST"},400);
    await this.state.storage.put({
      initialized:true,status:"waiting",hostHash:await sha256Hex(hostToken),guestHash:null,rules,
      gameId:null,epoch:null,version:-1,turnSeat:-1,turnDeadline:0,graceDeadline:0,
      disconnectHost:0,disconnectGuest:0,connectedOnceHost:false,connectedOnceGuest:false,
      connectionsReady:false,connectionDeadline:0,postmatchChoice:null,postmatchProcessing:false,createdAt:Date.now()
    });
    return json({ok:true,rules});
  }

  async inspect(){
    const status=String(await this.state.storage.get("status")??"");
    if(!status)return json({ok:false,code:"ROOM_NOT_FOUND"},404);
    if(status!=="waiting")return json({ok:false,code:"ROOM_NOT_JOINABLE",status},409);
    return json({ok:true,status,rules:await this.state.storage.get("rules")});
  }

  async join(body:any){
    if((await this.state.storage.get("status"))!=="waiting")return json({ok:false,code:"ROOM_NOT_JOINABLE"},409);
    const guestToken=String(body?.guestToken??"");if(!validOpaqueToken(guestToken))return json({ok:false,code:"INVALID_TOKEN"},400);
    const rules=parseRuleSet(await this.state.storage.get("rules"));if(!rules)return json({ok:false,code:"ROOM_RULES_INVALID"},500);
    const created=await engineCall(this.env,{op:"create_internal",rounds:rules.rounds,cpuProfile:0,firstDealer:-1,koiEnabled:rules.koiEnabled});
    if(!created.ok||!created.data?.ok||!created.data?.gameId)return json({ok:false,code:"ENGINE_CREATE_FAILED"},502);
    const gameId=String(created.data.gameId),version=Number(created.data.version),hostSnapshot=created.data.snapshot,epoch=randomToken();
    const guest=await engineCall(this.env,{op:"snapshot",gameId,seat:1});
    if(!guest.ok||!guest.data?.ok){await this.closeEngine(gameId);return json({ok:false,code:"ENGINE_GUEST_SNAPSHOT_FAILED"},502);}
    const engineStatus=roomStatusForPhase(Number(hostSnapshot?.phase)),status=engineStatus==="active"?"starting":engineStatus;
    await this.state.storage.put({
      guestHash:await sha256Hex(guestToken),status,gameId,epoch,version,turnSeat:Number(hostSnapshot?.turn??-1),
      turnDeadline:0,graceDeadline:0,connectionDeadline:Date.now()+120_000,connectionsReady:false,
      connectedOnceGuest:false,postmatchChoice:null,postmatchProcessing:false
    });
    await this.maybeActivateConnections();await this.scheduleNextAlarm();
    return json({ok:true,rules,epoch,version,snapshot:guest.data.snapshot,connectionsReady:(await this.state.storage.get("connectionsReady"))===true});
  }

  async authSeat(raw:string){
    if(!validOpaqueToken(raw))return -1;
    const hash=await sha256Hex(raw),host=String(await this.state.storage.get("hostHash")??""),guest=String(await this.state.storage.get("guestHash")??"");
    if(host&&timingSafe(hash,host))return 0;if(guest&&timingSafe(hash,guest))return 1;return -1;
  }

  async snapshotFor(seat:number){
    const gameId=String(await this.state.storage.get("gameId")??"");if(!gameId)return null;
    const result=await engineCall(this.env,{op:"snapshot",gameId,seat});
    return result.ok&&result.data?.ok?result.data:null;
  }

  async closeEngine(gameId?:string){
    const id=gameId??String(await this.state.storage.get("gameId")??"");if(!id)return;
    try{await engineCall(this.env,{op:"close",gameId:id});}catch{}
  }

  async maybeActivateConnections(){
    if((await this.state.storage.get("connectionsReady"))===true)return false;
    const host=(await this.state.storage.get("connectedOnceHost"))===true,guest=(await this.state.storage.get("connectedOnceGuest"))===true;
    if(!host||!guest)return false;
    let status=String(await this.state.storage.get("status")??"");
    if(status==="starting")status="active";
    const snapshot=(await this.snapshotFor(0))?.snapshot??null;
    const active=status==="active"&&ONLINE_ACTIVE_PHASES.has(Number(snapshot?.phase));
    await this.state.storage.put({connectionsReady:true,connectionDeadline:0,status,turnSeat:active?Number(snapshot?.turn??-1):-1,turnDeadline:active?Date.now()+60_000:0,graceDeadline:0});
    await this.scheduleNextAlarm();return true;
  }

  async connect(req:Request,url:URL){
    if(req.headers.get("Upgrade")!=="websocket")return json({ok:false,code:"UPGRADE_REQUIRED"},426);
    const seat=await this.authSeat(url.searchParams.get("token")??"");if(seat<0)return json({ok:false,code:"UNAUTHORIZED"},401);
    const currentStatus=String(await this.state.storage.get("status")??"");if(currentStatus==="timeout"||currentStatus==="closed")return json({ok:false,code:"ROOM_CLOSED"},410);
    const pair=new WebSocketPair(),client=pair[0],server=pair[1];server.accept();
    const prior=this.sockets.get(seat);try{prior?.close(4001,"replaced");}catch{}this.sockets.set(seat,server);
    await this.state.storage.put(seat===0?"disconnectHost":"disconnectGuest",0);
    await this.state.storage.put(seat===0?"connectedOnceHost":"connectedOnceGuest",true);
    const becameReady=await this.maybeActivateConnections();await this.scheduleNextAlarm();
    server.addEventListener("message",(event:any)=>this.onMessage(seat,event));
    server.addEventListener("close",()=>this.onDisconnect(seat,server));
    server.addEventListener("error",()=>this.onDisconnect(seat,server));
    const snap=await this.snapshotFor(seat),status=String(await this.state.storage.get("status")??"");
    server.send(JSON.stringify({type:"connected",seat,status,rules:await this.state.storage.get("rules"),epoch:await this.state.storage.get("epoch")??null,version:Number(await this.state.storage.get("version")??-1),connectionsReady:(await this.state.storage.get("connectionsReady"))===true,snapshot:snap?.snapshot??null}));
    if(becameReady)await this.broadcastState(status);
    return new Response(null,{status:101,webSocket:client} as any);
  }

  async onMessage(seat:number,event:any){
    let message:any;try{message=JSON.parse(String(event.data));}catch{return;}
    if(message?.type==="ping")try{this.sockets.get(seat)?.send(JSON.stringify({type:"pong",t:Date.now()}));}catch{}
  }

  async onDisconnect(seat:number,socket:any){
    if(this.sockets.get(seat)!==socket)return;this.sockets.delete(seat);
    const status=String(await this.state.storage.get("status")??"");if(!LIVE_ROOM_STATES.has(status))return;
    if((await this.state.storage.get("connectionsReady"))===true){const deadline=Date.now()+60_000;await this.state.storage.put(seat===0?"disconnectHost":"disconnectGuest",deadline);this.broadcastSame({type:"disconnect",seat,reconnectSeconds:60});}
    await this.scheduleNextAlarm();
  }

  broadcastSame(value:any){const text=JSON.stringify(value);for(const socket of this.sockets.values())try{socket.send(text);}catch{}}

  async broadcastState(statusOverride?:string,actionEvent:any=null){
    const status=statusOverride??String(await this.state.storage.get("status")??""),version=Number(await this.state.storage.get("version")??-1),rules=await this.state.storage.get("rules"),epoch=await this.state.storage.get("epoch")??null;
    for(const [seat,socket] of this.sockets){try{const snap=await this.snapshotFor(seat);socket.send(JSON.stringify({type:"state",status,version,epoch,rules,connectionsReady:(await this.state.storage.get("connectionsReady"))===true,snapshot:snap?.snapshot??null,actionEvent:actionEvent??null}));}catch{}}
  }

  async updateTurnTimer(snapshot:any,priorTurn:number){
    const phase=Number(snapshot?.phase),nextTurn=Number(snapshot?.turn),status=roomStatusForPhase(phase);
    if(status!=="active"||!ONLINE_ACTIVE_PHASES.has(phase)){
      await this.state.storage.put({turnSeat:-1,turnDeadline:0,graceDeadline:0});await this.scheduleNextAlarm();return status;
    }
    if((await this.state.storage.get("connectionsReady"))!==true)return "starting";
    const currentDeadline=Number(await this.state.storage.get("turnDeadline")??0);
    if(nextTurn!==priorTurn||currentDeadline<=0)await this.state.storage.put({turnSeat:nextTurn,turnDeadline:Date.now()+60_000,graceDeadline:0});
    await this.scheduleNextAlarm();return status;
  }

  async action(body:any){
    const status=String(await this.state.storage.get("status")??"");if(!["active","round_settlement"].includes(status))return json({ok:false,code:"ROOM_NOT_ACTIONABLE",status},409);
    if((await this.state.storage.get("connectionsReady"))!==true)return json({ok:false,code:"WAITING_FOR_CONNECTION"},409);
    const seat=await this.authSeat(String(body?.token??""));if(seat<0)return json({ok:false,code:"UNAUTHORIZED"},401);
    const epoch=String(body?.epoch??""),storedEpoch=String(await this.state.storage.get("epoch")??"");if(!validOpaqueToken(epoch)||!storedEpoch||!timingSafe(epoch,storedEpoch))return json({ok:false,code:"GAME_EPOCH_CONFLICT"},409);
    const expected=Number(body?.version),stored=Number(await this.state.storage.get("version")??-1);if(!Number.isSafeInteger(expected)||expected!==stored)return json({ok:false,code:"VERSION_CONFLICT",version:stored},409);
    const kind=String(body?.action??"");if(!["play","capture","koi","next_round"].includes(kind))return json({ok:false,code:"INVALID_ACTION"},400);
    const before=await this.snapshotFor(seat);if(!before)return json({ok:false,code:"ENGINE_STATUS_FAILED"},502);
    if(kind!=="next_round"&&Number(before.snapshot?.turn)!==seat)return json({ok:false,code:"NOT_YOUR_TURN",version:stored},409);
    if(kind==="next_round"&&Number(before.snapshot?.phase)!==5)return json({ok:false,code:"NOT_AT_SETTLEMENT",version:stored},409);
    const payload:any={op:"action",gameId:String(await this.state.storage.get("gameId")??""),seat,actor:seat,expectedVersion:stored,action:kind};
    if(kind==="play")payload.handIndex=Number(body?.handIndex);
    if(kind==="capture")payload.fieldIndex=Number(body?.fieldIndex);
    if(kind==="koi")payload.chooseKoi=body?.chooseKoi===true;
    const result=await engineCall(this.env,payload);
    if(!result.ok||!result.data?.ok)return json({ok:false,code:result.data?.code??"ENGINE_ACTION_FAILED",version:Number(result.data?.version??stored),snapshot:result.data?.snapshot??null},result.status||502);
    const version=Number(result.data.version),snapshot=result.data.snapshot,actionEvent=result.data?.actionEvent??null,roomStatus=await this.updateTurnTimer(snapshot,Number(before.snapshot?.turn));
    await this.state.storage.put({version,status:roomStatus});if(roomStatus==="complete")await this.state.storage.put({postmatchChoice:null,postmatchProcessing:false});
    await this.broadcastState(roomStatus,actionEvent);return json({ok:true,epoch:storedEpoch,version,snapshot,status:roomStatus,actionEvent});
  }

  async status(body:any){
    const seat=await this.authSeat(String(body?.token??""));if(seat<0)return json({ok:false,code:"UNAUTHORIZED"},401);
    const status=String(await this.state.storage.get("status")??""),snap=await this.snapshotFor(seat);
    return json({ok:true,status,epoch:await this.state.storage.get("epoch")??null,version:Number(await this.state.storage.get("version")??-1),rules:await this.state.storage.get("rules"),connectionsReady:(await this.state.storage.get("connectionsReady"))===true,snapshot:snap?.snapshot??null,postmatchChoice:await this.state.storage.get("postmatchChoice")??null});
  }

  async postmatch(body:any){
    const seat=await this.authSeat(String(body?.token??""));if(seat<0)return json({ok:false,code:"UNAUTHORIZED"},401);
    const epoch=String(body?.epoch??""),storedEpoch=String(await this.state.storage.get("epoch")??"");if(!validOpaqueToken(epoch)||!storedEpoch||!timingSafe(epoch,storedEpoch))return json({ok:false,code:"GAME_EPOCH_CONFLICT"},409);
    const existing=await this.state.storage.get("postmatchChoice");if(existing)return json({ok:true,locked:true,choice:existing});
    if((await this.state.storage.get("status"))!=="complete")return json({ok:false,code:"MATCH_NOT_COMPLETE"},409);
    const expected=Number(body?.version),stored=Number(await this.state.storage.get("version")??-1);if(!Number.isSafeInteger(expected)||expected!==stored)return json({ok:false,code:"VERSION_CONFLICT",version:stored},409);
    const choice=String(body?.choice??"");if(!["reconfigure","same","home"].includes(choice))return json({ok:false,code:"INVALID_CHOICE"},400);
    if(await this.state.storage.get("postmatchProcessing"))return json({ok:true,locked:true,choice:"processing"});await this.state.storage.put("postmatchProcessing",true);
    const oldGameId=String(await this.state.storage.get("gameId")??"");
    try{
      if(choice==="same"){
        const rules=parseRuleSet(await this.state.storage.get("rules"));if(!rules)throw new Error("ROOM_RULES_INVALID");
        const created=await engineCall(this.env,{op:"create_internal",rounds:rules.rounds,cpuProfile:0,firstDealer:-1,koiEnabled:rules.koiEnabled});if(!created.ok||!created.data?.ok||!created.data?.gameId)throw new Error("REMATCH_CREATE_FAILED");
        const newEpoch=randomToken(),newStatus=roomStatusForPhase(Number(created.data.snapshot?.phase)),active=newStatus==="active";
        await this.state.storage.put({postmatchChoice:null,postmatchSeat:seat,gameId:String(created.data.gameId),epoch:newEpoch,version:Number(created.data.version),status:newStatus,turnSeat:active?Number(created.data.snapshot.turn):-1,turnDeadline:active?Date.now()+60_000:0,graceDeadline:0,postmatchProcessing:false});
        await this.closeEngine(oldGameId);await this.scheduleNextAlarm();this.broadcastSame({type:"postmatch_choice",choice,seat});await this.broadcastState(newStatus);
        const chooserSnapshot=seat===0?created.data.snapshot:(await this.snapshotFor(1))?.snapshot??null;
        return json({ok:true,locked:true,choice,status:newStatus,epoch:newEpoch,version:Number(created.data.version),snapshot:chooserSnapshot});
      }
      if(choice==="reconfigure"){
        await this.state.storage.put({postmatchChoice:choice,postmatchSeat:seat,status:"reconfiguring",turnSeat:-1,turnDeadline:0,graceDeadline:0,postmatchProcessing:false});await this.scheduleNextAlarm();this.broadcastSame({type:"postmatch_choice",choice,seat});return json({ok:true,locked:true,choice,status:"reconfiguring"});
      }
      await this.state.storage.put({postmatchChoice:choice,postmatchSeat:seat,status:"closed",turnSeat:-1,turnDeadline:0,graceDeadline:0,disconnectHost:0,disconnectGuest:0,postmatchProcessing:false});await this.closeEngine(oldGameId);await this.scheduleNextAlarm();this.broadcastSame({type:"postmatch_choice",choice,seat});this.closeSockets(1000,"home");return json({ok:true,locked:true,choice,status:"closed"});
    }catch(e:any){await this.state.storage.put("postmatchProcessing",false);return json({ok:false,code:e?.message??"POSTMATCH_FAILED"},502);}
  }

  async reconfigure(body:any){
    if((await this.state.storage.get("status"))!=="reconfiguring")return json({ok:false,code:"NOT_RECONFIGURING"},409);
    const seat=await this.authSeat(String(body?.token??""));if(seat!==0)return json({ok:false,code:"HOST_ONLY"},403);
    const epoch=String(body?.epoch??""),storedEpoch=String(await this.state.storage.get("epoch")??"");if(!validOpaqueToken(epoch)||!storedEpoch||!timingSafe(epoch,storedEpoch))return json({ok:false,code:"GAME_EPOCH_CONFLICT"},409);
    const rules=parseRuleSet(body?.rules);if(!rules)return json({ok:false,code:"INVALID_RULESET"},400);
    const oldGameId=String(await this.state.storage.get("gameId")??""),created=await engineCall(this.env,{op:"create_internal",rounds:rules.rounds,cpuProfile:0,firstDealer:-1,koiEnabled:rules.koiEnabled});
    if(!created.ok||!created.data?.ok||!created.data?.gameId)return json({ok:false,code:"ENGINE_CREATE_FAILED"},502);
    const newEpoch=randomToken(),newStatus=roomStatusForPhase(Number(created.data.snapshot?.phase)),active=newStatus==="active";
    await this.state.storage.put({rules,gameId:String(created.data.gameId),epoch:newEpoch,version:Number(created.data.version),status:newStatus,postmatchChoice:null,postmatchProcessing:false,turnSeat:active?Number(created.data.snapshot.turn):-1,turnDeadline:active?Date.now()+60_000:0,graceDeadline:0});
    await this.closeEngine(oldGameId);await this.scheduleNextAlarm();this.broadcastSame({type:"rules_changed",rules});await this.broadcastState(newStatus);
    return json({ok:true,status:newStatus,rules,epoch:newEpoch,version:Number(created.data.version),snapshot:created.data.snapshot});
  }

  async close(body:any){
    const seat=await this.authSeat(String(body?.token??""));if(seat<0)return json({ok:false,code:"UNAUTHORIZED"},401);
    await this.state.storage.put({status:"closed",turnSeat:-1,turnDeadline:0,graceDeadline:0,connectionDeadline:0,disconnectHost:0,disconnectGuest:0});await this.closeEngine();await this.scheduleNextAlarm();
    this.broadcastSame({type:"closed",reason:String(body?.reason??"leave")});this.closeSockets(1000,"closed");return json({ok:true});
  }

  closeSockets(code:number,reason:string){for(const socket of this.sockets.values())try{socket.close(code,reason);}catch{}this.sockets.clear();}

  async scheduleNextAlarm(){
    const data=await this.state.storage.get(["status","connectionDeadline","turnDeadline","graceDeadline","disconnectHost","disconnectGuest"]),status=String(data.get("status")??"");
    if(!LIVE_ROOM_STATES.has(status)){await this.state.storage.deleteAlarm();return;}
    const values=[data.get("connectionDeadline"),data.get("turnDeadline"),data.get("graceDeadline"),data.get("disconnectHost"),data.get("disconnectGuest")].map(Number).filter(v=>v>0);
    if(!values.length){await this.state.storage.deleteAlarm();return;}await this.state.storage.setAlarm(Math.max(Date.now()+1,Math.min(...values)));
  }

  async alarm(){
    const status=String(await this.state.storage.get("status")??"");if(!LIVE_ROOM_STATES.has(status))return;
    const now=Date.now(),data=await this.state.storage.get(["connectionDeadline","turnDeadline","graceDeadline","disconnectHost","disconnectGuest"]),cd=Number(data.get("connectionDeadline")||0),dh=Number(data.get("disconnectHost")||0),dg=Number(data.get("disconnectGuest")||0),td=Number(data.get("turnDeadline")||0),gd=Number(data.get("graceDeadline")||0);
    if(cd&&cd<=now&&(await this.state.storage.get("connectionsReady"))!==true)return this.timeout("connection_timeout");
    if((dh&&dh<=now)||(dg&&dg<=now))return this.timeout("disconnect_timeout");
    if(gd&&gd<=now)return this.timeout("turn_timeout");
    if(td&&td<=now){await this.state.storage.put({turnDeadline:0,graceDeadline:now+30_000});this.broadcastSame({type:"turn_warning",seat:Number(await this.state.storage.get("turnSeat")??-1),graceSeconds:30});}
    await this.scheduleNextAlarm();
  }

  async timeout(reason:string){await this.state.storage.put({status:"timeout",turnSeat:-1,connectionDeadline:0,turnDeadline:0,graceDeadline:0,disconnectHost:0,disconnectGuest:0});await this.closeEngine();this.broadcastSame({type:"timeout",reason});this.closeSockets(4000,"timeout");await this.state.storage.deleteAlarm();}
}
