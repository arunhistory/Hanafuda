import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const configDir='assets/config';
const cards=JSON.parse(fs.readFileSync(path.join(configDir,'card-crops.json'),'utf8')).cards;
const fixed=[
 'assets/cards/sheet/card-sheet.png','assets/cards/back/card-back.png',
 'assets/backgrounds/normal/game-normal.png','assets/backgrounds/corrupted/game-corrupted.png','assets/backgrounds/settlement/settlement.png',
 'assets/effects/koikoi/koikoi-text.png','assets/effects/agari/agari-text.png','assets/effects/shared/callout-burst.png','assets/reserve/callout-reserve.png',
 path.join(configDir,'card-crops.json'),path.join(configDir,'asset-registry.json'),path.join(configDir,'animation-registry.json')
];
const files=[...fixed,...cards.map(c=>c.output)];
for(const f of files)if(!fs.existsSync(f))throw new Error(`missing asset: ${f}`);
const hashes=Object.fromEntries(files.slice().sort().map(f=>[f,hash(f)]));
const result={version:1,sourceCommit:process.env.GITHUB_SHA??null,sheetCropAtomic:{sheet:hash('assets/cards/sheet/card-sheet.png'),crops:hash(path.join(configDir,'card-crops.json'))},hashes};
fs.writeFileSync(path.join(configDir,'asset-version.json'),JSON.stringify(result,null,2)+'\n');
console.log(`PASS wrote asset-version.json with ${Object.keys(hashes).length} hashes`);
