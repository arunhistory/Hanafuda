import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('web/index.html','utf8');
const gate=fs.readFileSync('web/pregame-gate-v2.js','utf8');

assert.match(html,/pregame-gate-v2\.js/,'the pregame gate must be loaded');
assert.match(gate,/renderCpuPreparationScreen\(\)/,'start must enter a preparation-only screen before engine creation');

const shufflePos=gate.indexOf('await showShuffle(true);');
const startPos=gate.indexOf('const started=await api("/api/cpu/start"');
const dealPos=gate.indexOf('await dealPreparedSnapshot();');
const readyPos=gate.indexOf('await showReadyGate();');
const openPos=gate.indexOf('matchInteractionReady=true;',readyPos);
const cpuReadyPos=gate.indexOf('await releaseCpuAfterReady();',openPos);

assert.ok(shufflePos>=0,'shuffle must exist');
assert.ok(startPos>shufflePos,'authoritative game creation must happen only after shuffle completes');
assert.ok(dealPos>startPos,'deal presentation must happen after the authoritative initial snapshot exists');
assert.ok(readyPos>dealPos,'ready presentation must wait for dealing to finish');
assert.ok(openPos>readyPos,'player interaction must remain closed through the ready presentation');
assert.ok(cpuReadyPos>openPos,'CPU may be released only after the real match-start boundary');
assert.match(gate,/session=null;\s*snapshot=null;[\s\S]*renderCpuPreparationScreen\(\);[\s\S]*await showShuffle\(true\);/,'no authoritative game snapshot may exist during shuffle');

console.log('pregame engine-start ordering contract: PASS');
