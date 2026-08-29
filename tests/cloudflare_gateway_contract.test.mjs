import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dir=path.join(root,'cloudflare','v3-src');
const src=fs.readdirSync(dir).filter(x=>x.endsWith('.ts')).sort().map(x=>fs.readFileSync(path.join(dir,x),'utf8')).join('\n');
const checks=[
  ['internal Supabase boundary',src.includes('"x-hanafuda-internal":internal')],
  ['no service-role secret in Cloudflare source',!src.includes('SUPABASE_SERVICE_ROLE_KEY')],
  ['room rules are rounds+koi only',src.includes('k!=="rounds"&&k!=="koiEnabled"')],
  ['guest pre-join inspection exists',src.includes('/api/online/inspect')&&src.includes('op==="inspect"')],
  ['authoritative online actions exist',src.includes('/api/online/action')&&src.includes('expectedVersion')],
  ['random matching segregates RuleSet',src.includes('waiting:${key}')&&src.includes('ruleKey(rules)')],
  ['turn warning uses 60+30 seconds',src.includes('Date.now()+60_000')&&src.includes('graceDeadline:now+30_000')],
  ['disconnect timeout is distinct',src.includes('disconnect_timeout')&&src.includes('turn_timeout')],
  ['postmatch first-choice lock exists',src.includes('postmatchProcessing')&&src.includes('postmatchChoice')],
  ['arbitrary websocket relay removed from v3 room',!src.includes('m?.type==="relay"')&&!src.includes('message?.type==="relay"')],
  ['hidden trigger constants absent from gateway extension',!src.includes('playerTotal')&&!src.includes('cpuTotal')&&!src.includes('should_force_impossible')&&!src.includes('1000')],
];
for(const [name,ok] of checks)console.log(ok?'PASS':'FAIL',name);
if(checks.some(([,ok])=>!ok))process.exit(1);
