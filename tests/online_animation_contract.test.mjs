import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const cpu=fs.readFileSync(path.join(root,'web','src','cpu.ts'),'utf8');
const online=fs.readFileSync(path.join(root,'web','src','online.ts'),'utf8');

const duplicateGate=cpu.includes('alreadyApplied=Number.isSafeInteger(responseVersion)&&session.version>=responseVersion')&&cpu.includes('if(!alreadyApplied){');
const normalizedPostAction=cpu.includes('await acceptSnapshot(next,rawEvent,"player");');
const websocketSequence=online.includes('if(isNewAction)await acceptSnapshot(msg.snapshot,msg.actionEvent,msg.actionEvent?.actor===playerSeat()?"player":"opponent");')&&online.includes('else{snapshot=msg.snapshot;renderMatch();}');
const checks=[
  ['POST response suppresses an action version already applied by websocket',duplicateGate&&normalizedPostAction],
  ['websocket animates only a strictly newer action version',online.includes('const isNewAction=!!msg.actionEvent&&!epochChanged&&(!Number.isSafeInteger(incomingVersion)||incomingVersion>priorVersion)')&&online.includes('if(isNewAction)await acceptSnapshot')&&websocketSequence],
  ['epoch change never replays the prior match action',online.includes('!epochChanged')&&online.includes('if(epochChanged){roundHistory=[];currentRound=-1;}')],
];

for(const [name,ok] of checks)console.log(ok?'PASS':'FAIL',name);
if(checks.some(([,ok])=>!ok))process.exit(1);
