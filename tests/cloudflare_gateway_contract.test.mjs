import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dir=path.join(root,'cloudflare','v3-src');
const files=fs.readdirSync(dir).filter(x=>x.endsWith('.ts')).sort();
const src=files.map(x=>fs.readFileSync(path.join(dir,x),'utf8')).join('\n');
const directorySrc=fs.readFileSync(path.join(dir,'directory.ts'),'utf8');
const onlineRoomSrc=fs.readFileSync(path.join(dir,'online-room.ts'),'utf8');
const cpuSessionSrc=fs.readFileSync(path.join(dir,'cpu-session.ts'),'utf8');
const replacementPrior=onlineRoomSrc.indexOf('const prior=this.socketFor(seat);');
const replacementAccept=onlineRoomSrc.indexOf('this.state.acceptWebSocket(server',replacementPrior);
const replacementStore=onlineRoomSrc.indexOf('[this.connectionKey(seat)]:connectionId',replacementAccept);
const replacementClose=onlineRoomSrc.indexOf('prior?.close(4001,"replaced")',replacementStore);
const postmatchStart=onlineRoomSrc.indexOf('async postmatch(body:any)');
const postmatchLock=onlineRoomSrc.indexOf('await this.state.storage.put({postmatchChoice:choice',postmatchStart);
const postmatchRematchCreate=onlineRoomSrc.indexOf('op:"create_internal"',postmatchLock);
const cpuInitStart=cpuSessionSrc.indexOf('async init(body:any)');
const cpuInitEnd=cpuSessionSrc.indexOf('async modeSession()',cpuInitStart);
const cpuInitBlock=cpuSessionSrc.slice(cpuInitStart,cpuInitEnd);
const cpuReadyStart=cpuSessionSrc.indexOf('async ready()');
const cpuReadyEnd=cpuSessionSrc.indexOf('async action(body:any)',cpuReadyStart);
const cpuReadyBlock=cpuSessionSrc.slice(cpuReadyStart,cpuReadyEnd);
const checks=[
  ['internal Supabase boundary',src.includes('"x-hanafuda-internal":internal')],
  ['no service-role secret in Cloudflare source',!src.includes('SUPABASE_SERVICE_ROLE_KEY')],
  ['room rules are rounds+koi only',src.includes('k!=="rounds"&&k!=="koiEnabled"')],
  ['v3 owns online create join and connect routes',directorySrc.includes('url.pathname==="/api/online/create"')&&directorySrc.includes('url.pathname==="/api/online/join"')&&directorySrc.includes('url.pathname==="/api/online/connect"')],
  ['online create validates exact RuleSet before room creation',directorySrc.includes('const rules=parseRuleSet(body?.rules);if(!rules)return json({ok:false,code:"INVALID_RULESET"},400);')&&directorySrc.includes('JSON.stringify({op:"create",hostToken,rules})')],
  ['online join validates room code and creates only server token',directorySrc.includes('if(!validRoomCode(code))return json({ok:false,code:"INVALID_ROOM_CODE"},400);')&&directorySrc.includes('const guestToken=randomToken(),stub=env.ROOMS.get')&&directorySrc.includes('JSON.stringify({op:"join",guestToken})')],
  ['online connect validates room code and opaque token at v3 gateway',directorySrc.includes('if(!validRoomCode(code)||!validOpaqueToken(token))return json({ok:false,code:"INVALID_SESSION"},400);')&&directorySrc.includes('target.pathname="/connect"')],
  ['guest pre-join inspection exists',src.includes('/api/online/inspect')&&src.includes('op==="inspect"')],
  ['authoritative online actions exist',src.includes('/api/online/action')&&src.includes('expectedVersion')],
  ['authoritative action events propagate to CPU and online clients',src.includes('actionEvent:result.data?.actionEvent??null')&&src.includes('broadcastState(roomStatus,actionEvent)')&&src.includes('actionEvent:actionEvent??null')],
  ['forced challenge has explicit transition handshake',src.includes('/api/cpu/transition')&&src.includes('transition_ack')&&src.includes('pendingTransition')],
  ['challenge creates private CPU profile only after transition',src.includes('cpuProfile:3')&&src.includes('CHALLENGE_ENGINE_CREATE_FAILED')],
  ['developer challenge cannot grant normal unlock',src.includes('challengeTestOnly:testOnly')&&src.includes('challengeTestOnly')],
  ['direct hidden mode requires local unlock signal and official origin',src.includes('body?.unlocked!==true')&&src.includes('req.headers.get("Origin")!==env.APP_ORIGIN')&&src.includes('MODE_LOCKED')],
  ['CPU start endpoint does not advance the CPU before presentation readiness',cpuInitStart>=0&&cpuInitEnd>cpuInitStart&&!cpuInitBlock.includes('this.runCpu(events)')&&cpuInitBlock.includes('ready:false')],
  ['CPU ready endpoint is explicit and authenticated',cpuSessionSrc.includes('/api/cpu/ready')&&cpuSessionSrc.includes('if(op==="ready")return this.ready();')&&cpuReadyStart>=0],
  ['CPU moves only after ready gate opens',cpuReadyBlock.includes('this.runCpu(events)')&&cpuReadyBlock.includes('ready:true')],
  ['player actions cannot race before ready',cpuSessionSrc.includes('SESSION_NOT_READY')&&cpuSessionSrc.includes('storage.get("ready")')],
  ['next round closes CPU gate before the new dealer can move',cpuSessionSrc.includes('if(kind==="next_round")')&&cpuSessionSrc.includes('ready:false,readyPayload:null')],
  ['hidden challenge transition also starts behind the ready gate',cpuSessionSrc.includes('developer:false,ready:false,readyPayload:null,transitionedAt')&&!cpuSessionSrc.slice(cpuSessionSrc.indexOf('async transition()'),cpuSessionSrc.indexOf('async status()')).includes('this.runCpu(events)')],
  ['random matching segregates RuleSet',src.includes('waiting:${key}')&&src.includes('ruleKey(rules)')],
  ['random matchmaking is WebSocket event-driven',src.includes('/api/online/random/connect')&&src.includes('new WebSocketPair()')&&src.includes('type:"matched"')&&!src.includes('op==="poll"')&&!src.includes('op==="enqueue"')],
  ['matchmaking sockets use Durable Object hibernation API',directorySrc.includes('this.state.acceptWebSocket(server')&&directorySrc.includes('this.state.getWebSockets(`ticket:${ticket}`)')&&directorySrc.includes('serializeAttachment')&&directorySrc.includes('webSocketMessage(')&&!directorySrc.includes('server.accept()')&&!directorySrc.includes('server.addEventListener(')],
  ['online room sockets use Durable Object hibernation API',onlineRoomSrc.includes('this.state.acceptWebSocket(server')&&onlineRoomSrc.includes('this.state.getWebSockets(`seat:${seat}`)')&&onlineRoomSrc.includes('serializeAttachment({seat,connectionId})')&&onlineRoomSrc.includes('webSocketMessage(')&&onlineRoomSrc.includes('webSocketClose(')&&onlineRoomSrc.includes('webSocketError(')&&!onlineRoomSrc.includes('server.accept()')&&!onlineRoomSrc.includes('server.addEventListener(')&&!onlineRoomSrc.includes('sockets:Map<number,any>')],
  ['replaced online sockets cannot create false disconnects',onlineRoomSrc.includes('connectionIdHost')&&onlineRoomSrc.includes('connectionIdGuest')&&onlineRoomSrc.includes('timingSafe(current,connectionId)')],
  ['new online connection becomes authoritative before old socket closes',replacementPrior>=0&&replacementAccept>replacementPrior&&replacementStore>replacementAccept&&replacementClose>replacementStore],
  ['legacy polling endpoint is explicitly rejected',src.includes('MATCHMAKING_WEBSOCKET_REQUIRED')&&src.includes('},410)')],
  ['matchmaking cleanup uses DO alarm not cron',src.includes('async alarm()')&&src.includes('setAlarm')&&src.includes('waiting:')&&src.includes('MATCHMAKING_TIMEOUT')&&!src.toLowerCase().includes('cron')],
  ['turn warning uses 60+30 seconds',src.includes('Date.now()+60_000')&&src.includes('graceDeadline:now+30_000')],
  ['initial turn timer waits for both connections',src.includes('connectionsReady')&&src.includes('connectionDeadline:Date.now()+120_000')&&src.includes('WAITING_FOR_CONNECTION')],
  ['disconnect timeout is distinct',src.includes('disconnect_timeout')&&src.includes('turn_timeout')&&src.includes('connection_timeout')],
  ['postmatch first-choice lock exists',src.includes('postmatchProcessing')&&src.includes('postmatchChoice')],
  ['postmatch first valid choice locks before rematch work',postmatchLock>=0&&postmatchRematchCreate>postmatchLock],
  ['postmatch late prior-epoch choices return the first valid choice',onlineRoomSrc.includes('previousPostmatchEpoch')&&onlineRoomSrc.includes('previousPostmatchChoice')&&onlineRoomSrc.includes('timingSafe(epoch,previousEpoch)')&&onlineRoomSrc.includes('stale:true')],
  ['postmatch processing reports the real locked choice',onlineRoomSrc.includes('processing:state.get("postmatchProcessing")===true')&&!onlineRoomSrc.includes('choice:"processing"')],
  ['game epoch blocks stale ABA actions',src.includes('GAME_EPOCH_CONFLICT')&&src.includes('epoch=randomToken()')],
  ['online engine cleanup exists',src.includes('op:"close"')&&src.includes('closeEngine')],
  ['arbitrary websocket relay removed from v3 room',!src.includes('m?.type==="relay"')&&!src.includes('message?.type==="relay"')],
  ['hidden trigger constants absent from gateway extension',!src.includes('playerTotal')&&!src.includes('cpuTotal')&&!src.includes('should_force_impossible')],
];
for(const [name,ok] of checks)console.log(ok?'PASS':'FAIL',name);
if(checks.some(([,ok])=>!ok))process.exit(1);
