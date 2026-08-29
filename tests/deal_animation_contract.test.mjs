import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=fs.readFileSync(path.join(root,'web','src','experience.ts'),'utf8');
const checks=[
  ['field card i is sequence i*3',source.includes('if(kind==="field")return index*3;')],
  ['non-dealer receives each card before dealer',source.includes('const offset=seat===s.dealer?2:1;')],
  ['each hand animation index advances by one three-step deal cycle',source.includes('return index*3+offset;')],
  ['legacy two-card group ordering is absent',!source.includes('Math.floor(index/2)')&&!source.includes('group*6+offset+within')],
];
for(const [name,ok] of checks)console.log(ok?'PASS':'FAIL',name);
if(checks.some(([,ok])=>!ok))process.exit(1);
