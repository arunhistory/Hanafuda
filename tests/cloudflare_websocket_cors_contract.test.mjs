import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const common=fs.readFileSync(path.join(root,'cloudflare','v3-src','gateway-common.ts'),'utf8');
const directory=fs.readFileSync(path.join(root,'cloudflare','v3-src','directory.ts'),'utf8');

const checks=[
  ['CORS returns WebSocket upgrades without rebuilding Response',common.includes('response.status===101||(response as any).webSocket')&&common.indexOf('response.status===101||(response as any).webSocket')<common.indexOf('new Response(response.body')],
  ['online room connect remains WebSocket upgrade route',directory.includes('req.headers.get("Upgrade")!=="websocket"')&&directory.includes('status:101,webSocket:client')],
  ['online gateway forwards the original upgrade request',directory.includes('env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(new Request(target.toString(),req))')]
];
for(const [name,ok] of checks)console.log(ok?'PASS':'FAIL',name);
if(checks.some(([,ok])=>!ok))process.exit(1);
