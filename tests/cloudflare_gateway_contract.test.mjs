import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dir=path.join(root,'cloudflare','v3-src');
const files=fs.readdirSync(dir).filter(x=>x.endsWith('.ts')).sort();
const src=files.map(x=>fs.readFileSync(path.join(dir,x),'utf8')).join('\n');
const directorySrc=fs.readFileSync(path.join(dir,'directory.ts'),'utf8');
const checks=[
  ['internal Supabase boundary',src.includes('"x-hanafuda-internal":internal')],
  ['no service-role secret in Cloudflare source',!src.includes('SUPABASE_SERVICE_ROLE_KEY')],
  ['room rules are rounds+koi only',src.includes('k!=="rounds"&&k!=="koiEnabled"')],
  ['guest pre-join inspection exists',src.includes('/api/online/inspect')&&src.includes('op==="inspect"')],
  ['authoritative online actions exist',src.includes('/api/online/action')&&src.includes('expectedVersion')],
  ['authoritative action events propagate to CPU and online clients',src.includes('actionEvent:result.data?.actionEvent??null')&&src.includes('broadcastState(roomStatus,actionEvent)')&&src.includes('actionEvent:actionEvent??null')],
  ['forced challenge has explicit transition handshake',src.includes('/api/cpu/transition')&&src.includes('transition_ack')&&src.includes('pendingTransition')],
  ['challenge creates private CPU profile only after transition',src.includes('cpuProfile:3')&&src.includes('CHALLENGE_ENGINE_CREATE_FAILED')],
  ['developer challenge cannot grant normal unlock',src.includes('challengeTestOnly:testOnly')&&src.includes('challengeTestOnly')],
  ['direct hidden mode requires local unlock signal and official origin',src.includes('body?.unlocked!==true')&&src.includes('req.headers.get("Origin")!==env.APP_ORIGIN')&&src.includes('MODE_LOCKED')],
  ['random matching segregates RuleSet',src.includes('waiting:${key}')&&src.includes('ruleKey(rules)')],
  ['random matchmaking is WebSocket event-driven',src.includes('/api/online/random/connect')&&src.includes('new WebSocketPair()')&&src.includes('type:"matched"')&&!src.includes('op==="poll"')&&!src.includes('op==="enqueue"')],
  ['matchmaking sockets use Durable Object hibernation API',directorySrc.includes('this.state.acceptWebSocket(server')&&directorySrc.includes('this.state.getWebSockets(`ticket:${ticket}`)')&&directorySrc.includes('serializeAttachment')&&directorySrc.includes('webSocketMessage(')&&!directorySrc.includes('server.accept()')&&!directorySrc.includes('server.addEventListener(')],
  ['legacy polling endpoint is explicitly rejected',src.includes('MATCHMAKING_WEBSOCKET_REQUIRED')&&src.includes('},410)')],
  ['matchmaking cleanup uses DO alarm not cron',src.includes('async alarm()')&&src.includes('setAlarm')&&src.includes('waiting:')&&src.includes('MATCHMAKING_TIMEOUT')&&!src.toLowerCase().includes('cron')],
  ['turn warning uses 60+30 seconds',src.includes('Date.now()+60_000')&&src.includes('graceDeadline:now+30_000')],
  ['initial turn timer waits for both connections',src.includes('connectionsReady')&&src.includes('connectionDeadline:Date.now()+120_000')&&src.includes('WAITING_FOR_CONNECTION')],
  ['disconnect timeout is distinct',src.includes('disconnect_timeout')&&src.includes('turn_timeout')&&src.includes('connection_timeout')],
  ['postmatch first-choice lock exists',src.includes('postmatchProcessing')&&src.includes('postmatchChoice')],
  ['game epoch blocks stale ABA actions',src.includes('GAME_EPOCH_CONFLICT')&&src.includes('epoch=randomToken()')],
  ['online engine cleanup exists',src.includes('op:"close"')&&src.includes('closeEngine')],
  ['arbitrary websocket relay removed from v3 room',!src.includes('m?.type==="relay"')&&!src.includes('message?.type==="relay"')],
  ['hidden trigger constants absent from gateway extension',!src.includes('playerTotal')&&!src.includes('cpuTotal')&&!src.includes('should_force_impossible')],
];
for(const [name,ok] of checks)console.log(ok?'PASS':'FAIL',name);
if(checks.some(([,ok])=>!ok))process.exit(1);
