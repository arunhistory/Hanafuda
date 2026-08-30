import {JSON_HEADERS,CPU_PHASES,json,randomToken,sha256Hex,timingSafe,bodyJson,safeCpuMode,modeCode,parseRounds,validOpaqueToken,engineCall} from "./gateway-common.js";

export class HanafudaCpuSession {
  state:any; env:any;
  constructor(state:any,env:any){this.state=state;this.env=env;}

  async fetch(req:Request){
    if(req.method!=="POST")return json({ok:false,code:"METHOD_NOT_ALLOWED"},405);
    let body:any;try{body=await bodyJson(req);}catch(e:any){return json({ok:false,code:e?.message==="REQUEST_TOO_LARGE"?"REQUEST_TOO_LARGE":"INVALID_JSON"},400);}
    const op=String(body?.op??"");
    if(op==="init")return this.init(body);
    const token=String(body?.token??"");
    const storedHash=String(await this.state.storage.get("tokenHash")??"");
    if(!validOpaqueToken(token)||!storedHash||!timingSafe(await sha256Hex(token),storedHash))return json({ok:false,code:"UNAUTHORIZED"},401);
    if(op==="ready")return this.ready();
    if(op==="action")return this.action(body);
    if(op==="status")return this.status();
    if(op==="transition")return this.transition();
    if(op==="close")return this.close();
    return json({ok:false,code:"UNKNOWN_OPERATION"},404);
  }

  async init(body:any){
    if(await this.state.storage.get("initialized"))return json({ok:false,code:"ALREADY_INITIALIZED"},409);
    const token=String(body?.token??""),mode=safeCpuMode(String(body?.mode??"")),rounds=parseRounds(body?.rounds),koiEnabled=body?.koiEnabled;
    const modeSessionId=String(body?.modeSessionId??""),modeSessionToken=String(body?.modeSessionToken??"");
    if(!validOpaqueToken(token)||!mode||rounds===null||typeof koiEnabled!=="boolean")return json({ok:false,code:"INVALID_INIT"},400);

    let developer=false;
    if(mode!=="impossible"){
      if(!validOpaqueToken(modeSessionId)||!validOpaqueToken(modeSessionToken))return json({ok:false,code:"INVALID_MODE_SESSION"},400);
      let modeId:any;try{modeId=this.env.MODE_SESSIONS.idFromString(modeSessionId);}catch{return json({ok:false,code:"INVALID_MODE_SESSION"},400);}
      const modeStub=this.env.MODE_SESSIONS.get(modeId);
      const modeResponse=await modeStub.fetch("https://mode/op",{method:"POST",body:JSON.stringify({op:"status",token:modeSessionToken})});
      const modeData=await modeResponse.json().catch(()=>null);
      if(!modeResponse.ok||modeData?.mode!==mode||Number(modeData?.rounds)!==rounds||modeData?.phase!=="active")return json({ok:false,code:"MODE_SESSION_MISMATCH"},409);
      developer=modeData?.developer===true;
    }

    const created=await engineCall(this.env,{op:"create_internal",rounds,cpuProfile:modeCode(mode),firstDealer:-1,koiEnabled});
    if(!created.ok||!created.data?.ok||!created.data?.gameId)return json({ok:false,code:"ENGINE_CREATE_FAILED"},502);
    await this.state.storage.put({initialized:true,closed:false,ready:false,tokenHash:await sha256Hex(token),mode,rounds,koiEnabled,gameId:created.data.gameId,version:Number(created.data.version),modeSessionId:mode==="impossible"?null:modeSessionId,modeSessionToken:mode==="impossible"?null:modeSessionToken,developer,pendingTransition:false,challenge:false,challengeTestOnly:false,unlockGranted:false,createdAt:Date.now()});

    const events=[{actor:"system",snapshot:created.data.snapshot,version:Number(created.data.version),actionEvent:null}];
    let modeTransition:any=null;
    if(Number(created.data.snapshot?.phase)===5&&mode!=="impossible"){
      const ms=await this.modeSession();
      const check=ms?await engineCall(this.env,{op:"mode_check",gameId:String(created.data.gameId),seat:0,modeSession:ms}):null;
      if(check?.ok&&check.data?.ok&&check.data?.modeTransition?.transition==="impossible"){
        modeTransition=check.data.modeTransition;
        await this.state.storage.put({pendingTransition:true,forcedRounds:Number(modeTransition.forcedRounds??6),pendingModeTransition:modeTransition});
      }
    }
    const finalEvent=events[events.length-1];
    const unlockGranted=await this.maybeGrantUnlock(finalEvent.snapshot);
    return json({ok:true,version:Number(finalEvent.version),snapshot:finalEvent.snapshot,events,modeTransition,unlockGranted,mode,rounds,koiEnabled,ready:false});
  }

  async modeSession(){
    const sessionId=String(await this.state.storage.get("modeSessionId")??""),token=String(await this.state.storage.get("modeSessionToken")??"");
    return validOpaqueToken(sessionId)&&validOpaqueToken(token)?{sessionId,token}:null;
  }

  async engineAction(action:any){
    const gameId=String(await this.state.storage.get("gameId")??"");
    const version=Number(await this.state.storage.get("version")??-1);
    const payload:any={op:"action",gameId,seat:0,expectedVersion:version,...action};
    const ms=await this.modeSession();if(ms)payload.modeSession=ms;
    const result=await engineCall(this.env,payload);
    if(result.ok&&result.data?.ok&&Number.isSafeInteger(Number(result.data.version)))await this.state.storage.put("version",Number(result.data.version));
    return result;
  }

  async maybeGrantUnlock(snapshot:any){
    if((await this.state.storage.get("unlockGranted"))===true)return true;
    if((await this.state.storage.get("challenge"))!==true||(await this.state.storage.get("challengeTestOnly"))===true)return false;
    if(Number(snapshot?.phase)===6&&Number(snapshot?.matchWinner)===0){await this.state.storage.put({unlockGranted:true,unlockGrantedAt:Date.now()});return true;}
    return false;
  }

  async runCpu(events:any[]){
    for(let guard=0;guard<8;guard++){
      const last=events[events.length-1];
      const snap=last?.snapshot;
      if(!snap||snap.turn!==1||!CPU_PHASES.has(Number(snap.phase)))return {ok:true};
      const result=await this.engineAction({action:"cpu_step",actor:1});
      if(!result.ok||!result.data?.ok)return {ok:false,response:json({ok:false,code:"CPU_ENGINE_FAILED",detail:result.data?.code??null},result.status||502)};
      events.push({actor:"cpu",snapshot:result.data.snapshot,version:Number(result.data.version),actionEvent:result.data?.actionEvent??null});
      if(result.data?.modeTransition?.transition==="impossible"){
        await this.state.storage.put({pendingTransition:true,forcedRounds:Number(result.data.modeTransition.forcedRounds??6),pendingModeTransition:result.data.modeTransition});
        return {ok:true,modeTransition:result.data.modeTransition};
      }
      await this.maybeGrantUnlock(result.data.snapshot);
    }
    return {ok:false,response:json({ok:false,code:"CPU_STEP_GUARD"},500)};
  }

  async ready(){
    if((await this.state.storage.get("closed"))===true)return json({ok:false,code:"SESSION_CLOSED"},410);
    if((await this.state.storage.get("ready"))===true){
      const cached=await this.state.storage.get("readyPayload");
      if(cached)return json(cached);
    }
    const gameId=String(await this.state.storage.get("gameId")??"");
    const current=await engineCall(this.env,{op:"snapshot",gameId,seat:0});
    if(!current.ok||!current.data?.ok)return json({ok:false,code:"ENGINE_STATUS_FAILED"},current.status||502);
    const version=Number(current.data.version);await this.state.storage.put("version",version);
    const events=[{actor:"system",snapshot:current.data.snapshot,version,actionEvent:null}];
    let modeTransition:any=await this.state.storage.get("pendingModeTransition")??null;
    if(!(await this.state.storage.get("pendingTransition"))&&Number(current.data.snapshot?.turn)===1&&CPU_PHASES.has(Number(current.data.snapshot?.phase))){
      const cpu=await this.runCpu(events);
      if(!cpu.ok)return cpu.response;
      modeTransition=cpu.modeTransition??modeTransition;
    }
    const finalEvent=events[events.length-1];
    const unlockGranted=await this.maybeGrantUnlock(finalEvent.snapshot);
    const payload={ok:true,version:Number(finalEvent.version),snapshot:finalEvent.snapshot,events,modeTransition,unlockGranted,ready:true};
    await this.state.storage.put({ready:true,readyPayload:payload,readyAt:Date.now()});
    return json(payload);
  }

  async action(body:any){
    if((await this.state.storage.get("closed"))===true)return json({ok:false,code:"SESSION_CLOSED"},410);
    if((await this.state.storage.get("ready"))!==true)return json({ok:false,code:"SESSION_NOT_READY"},409);
    const clientVersion=Number(body?.version),storedVersion=Number(await this.state.storage.get("version")??-1);
    if(!Number.isSafeInteger(clientVersion)||clientVersion!==storedVersion)return json({ok:false,code:"VERSION_CONFLICT",version:storedVersion},409);
    if(await this.state.storage.get("pendingTransition"))return json({ok:false,code:"TRANSITION_REQUIRED",forcedRounds:Number(await this.state.storage.get("forcedRounds")??6)},409);
    const kind=String(body?.action??"");
    const allowed=new Set(["play","capture","koi","next_round"]);
    if(!allowed.has(kind))return json({ok:false,code:"INVALID_ACTION"},400);
    const payload:any={action:kind,actor:0};
    if(kind==="play")payload.handIndex=Number(body?.handIndex);
    if(kind==="capture")payload.fieldIndex=Number(body?.fieldIndex);
    if(kind==="koi")payload.chooseKoi=body?.chooseKoi===true;
    const result=await this.engineAction(payload);
    if(!result.ok||!result.data?.ok)return json({ok:false,code:result.data?.code??"ENGINE_ACTION_FAILED",version:Number(result.data?.version??storedVersion),snapshot:result.data?.snapshot??null},result.status||502);
    const events=[{actor:"player",snapshot:result.data.snapshot,version:Number(result.data.version),actionEvent:result.data?.actionEvent??null}];
    if(result.data?.modeTransition?.transition==="impossible"){
      await this.state.storage.put({pendingTransition:true,forcedRounds:Number(result.data.modeTransition.forcedRounds??6),pendingModeTransition:result.data.modeTransition});
      return json({ok:true,version:Number(result.data.version),snapshot:result.data.snapshot,events,modeTransition:result.data.modeTransition,unlockGranted:false});
    }
    if(kind==="next_round"){
      const payload={ok:true,version:Number(result.data.version),snapshot:result.data.snapshot,events,modeTransition:null,unlockGranted:false,ready:false};
      await this.state.storage.put({ready:false,readyPayload:null,readyAt:null});
      return json(payload);
    }
    const cpu=await this.runCpu(events);
    if(!cpu.ok)return cpu.response;
    const finalEvent=events[events.length-1];
    const unlockGranted=await this.maybeGrantUnlock(finalEvent.snapshot);
    return json({ok:true,version:Number(finalEvent.version),snapshot:finalEvent.snapshot,events,modeTransition:cpu.modeTransition??null,unlockGranted,ready:true});
  }

  async transition(){
    if((await this.state.storage.get("closed"))===true)return json({ok:false,code:"SESSION_CLOSED"},410);
    if((await this.state.storage.get("pendingTransition"))!==true)return json({ok:false,code:"NO_PENDING_TRANSITION"},409);
    const ms=await this.modeSession();if(!ms)return json({ok:false,code:"MODE_SESSION_MISSING"},409);
    const oldGameId=String(await this.state.storage.get("gameId")??""),koiEnabled=(await this.state.storage.get("koiEnabled"))===true,testOnly=(await this.state.storage.get("developer"))===true;
    const forcedRounds=Number(await this.state.storage.get("forcedRounds")??6);
    const created=await engineCall(this.env,{op:"create_internal",rounds:forcedRounds,cpuProfile:3,firstDealer:-1,koiEnabled});
    if(!created.ok||!created.data?.ok||!created.data?.gameId)return json({ok:false,code:"CHALLENGE_ENGINE_CREATE_FAILED"},502);
    let modeId:any;try{modeId=this.env.MODE_SESSIONS.idFromString(ms.sessionId);}catch{await engineCall(this.env,{op:"close",gameId:String(created.data.gameId)}).catch(()=>null);return json({ok:false,code:"INVALID_MODE_SESSION"},409);}
    const modeStub=this.env.MODE_SESSIONS.get(modeId),ack=await modeStub.fetch("https://mode/op",{method:"POST",body:JSON.stringify({op:"transition_ack",token:ms.token})}),ackData=await ack.json().catch(()=>null);
    if(!ack.ok||ackData?.mode!=="impossible"){await engineCall(this.env,{op:"close",gameId:String(created.data.gameId)}).catch(()=>null);return json({ok:false,code:"TRANSITION_ACK_FAILED"},ack.status||502);}
    await this.state.storage.put({mode:"impossible",rounds:forcedRounds,gameId:String(created.data.gameId),version:Number(created.data.version),pendingTransition:false,pendingModeTransition:null,forcedRounds,challenge:true,challengeTestOnly:testOnly,unlockGranted:false,developer:false,ready:false,readyPayload:null,transitionedAt:Date.now()});
    if(oldGameId)await engineCall(this.env,{op:"close",gameId:oldGameId}).catch(()=>null);
    const events=[{actor:"system",snapshot:created.data.snapshot,version:Number(created.data.version),actionEvent:null}];
    const finalEvent=events[events.length-1];
    return json({ok:true,mode:"impossible",rounds:forcedRounds,version:Number(finalEvent.version),snapshot:finalEvent.snapshot,events,unskippable:true,unlockGranted:false,ready:false});
  }

  async status(){
    if((await this.state.storage.get("closed"))===true)return json({ok:true,closed:true,pendingTransition:false,unlockGranted:(await this.state.storage.get("unlockGranted"))===true});
    const gameId=String(await this.state.storage.get("gameId")??"");
    const result=await engineCall(this.env,{op:"snapshot",gameId,seat:0});
    if(!result.ok||!result.data?.ok)return json({ok:false,code:"ENGINE_STATUS_FAILED"},result.status||502);
    const version=Number(result.data.version);await this.state.storage.put("version",version);
    const unlockGranted=await this.maybeGrantUnlock(result.data.snapshot);
    return json({ok:true,mode:await this.state.storage.get("mode"),rounds:Number(await this.state.storage.get("rounds")??0),version,snapshot:result.data.snapshot,pendingTransition:(await this.state.storage.get("pendingTransition"))===true,forcedRounds:Number(await this.state.storage.get("forcedRounds")??0),unlockGranted,ready:(await this.state.storage.get("ready"))===true});
  }

  async close(){
    if((await this.state.storage.get("closed"))===true)return json({ok:true,closed:true});
    const gameId=String(await this.state.storage.get("gameId")??"");
    if(gameId){const result=await engineCall(this.env,{op:"close",gameId});if(!result.ok&&!([404,410].includes(result.status)))return json({ok:false,code:"ENGINE_CLOSE_FAILED"},result.status||502);}
    await this.state.storage.put({closed:true,pendingTransition:false,ready:false,closedAt:Date.now()});
    return json({ok:true,closed:true});
  }
}

export async function routeCpu(req:Request,env:any,url:URL){
  if(req.method!=="POST")return json({ok:false,code:"METHOD_NOT_ALLOWED"},405);
  let body:any;try{body=await bodyJson(req);}catch(e:any){return json({ok:false,code:e?.message==="REQUEST_TOO_LARGE"?"REQUEST_TOO_LARGE":"INVALID_JSON"},400);}
  if(url.pathname==="/api/cpu/start"){
    const mode=safeCpuMode(String(body?.mode??"")),rounds=parseRounds(body?.rounds),koiEnabled=body?.koiEnabled;
    if(!mode||rounds===null||typeof koiEnabled!=="boolean")return json({ok:false,code:"INVALID_RULESET"},400);
    const directImpossible=mode==="impossible";
    if(directImpossible&&(body?.unlocked!==true||req.headers.get("Origin")!==env.APP_ORIGIN))return json({ok:false,code:"MODE_LOCKED"},403);
    const modeSessionId=String(body?.modeSessionId??""),modeSessionToken=String(body?.modeSessionToken??"");
    if(!directImpossible&&(!validOpaqueToken(modeSessionId)||!validOpaqueToken(modeSessionToken)))return json({ok:false,code:"INVALID_MODE_SESSION"},400);
    const id=env.CPU_SESSIONS.newUniqueId(),token=randomToken(),stub=env.CPU_SESSIONS.get(id);
    const response=await stub.fetch("https://cpu/init",{method:"POST",body:JSON.stringify({op:"init",token,mode,rounds,koiEnabled,modeSessionId:directImpossible?null:modeSessionId,modeSessionToken:directImpossible?null:modeSessionToken})});
    const data=await response.json().catch(()=>null);
    if(!response.ok||!data?.ok)return json(data??{ok:false,code:"CPU_SESSION_INIT_FAILED"},response.status||502);
    return json({ok:true,sessionId:id.toString(),token,version:data.version,snapshot:data.snapshot,events:data.events??[],modeTransition:data.modeTransition??null,unlockGranted:data.unlockGranted===true,mode,rounds,koiEnabled,ready:false});
  }
  const sessionId=String(body?.sessionId??""),token=String(body?.token??"");
  if(!validOpaqueToken(sessionId)||!validOpaqueToken(token))return json({ok:false,code:"INVALID_SESSION"},400);
  let id:any;try{id=env.CPU_SESSIONS.idFromString(sessionId);}catch{return json({ok:false,code:"INVALID_SESSION"},400);}
  const stub=env.CPU_SESSIONS.get(id);
  const op=url.pathname==="/api/cpu/ready"?"ready":url.pathname==="/api/cpu/action"?"action":url.pathname==="/api/cpu/status"?"status":url.pathname==="/api/cpu/transition"?"transition":url.pathname==="/api/cpu/close"?"close":null;
  if(!op)return json({ok:false,code:"NOT_FOUND"},404);
  const response=await stub.fetch("https://cpu/op",{method:"POST",body:JSON.stringify({...body,op,token})});
  const text=await response.text();return new Response(text,{status:response.status,headers:JSON_HEADERS});
}
