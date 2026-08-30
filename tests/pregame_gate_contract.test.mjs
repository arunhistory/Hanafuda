import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('web/index.html','utf8');
const gate=fs.readFileSync('web/pregame-gate-v3.js','utf8');

assert.match(html,/pregame-gate-v3\.js/,'the authoritative pregame gate must be loaded');
assert.doesNotMatch(html,/pregame-gate-v2\.js/,'the obsolete pregame gate must not be loaded');
assert.match(gate,/startCpuSequencedV3\(\)/,'v3 must own the sequenced CPU start path');
assert.match(gate,/stopImmediatePropagation\(\)/,'v3 must block every legacy start click handler');
assert.match(gate,/addEventListener\("click"[\s\S]*true\);/,'the pregame start interception must run in capture phase');

const shufflePos=gate.indexOf('await showShuffle(true);');
const startPos=gate.indexOf('const started=await api("/api/cpu/start"');
const dealPos=gate.indexOf('await dealPreparedSnapshotV3();');
const readyPos=gate.indexOf('await showReadyGate();');
const openPos=gate.indexOf('matchInteractionReady=true;',readyPos);
const cpuReadyPos=gate.indexOf('await releaseCpuAfterReady();',openPos);

assert.ok(shufflePos>=0,'shuffle must exist');
assert.ok(startPos>shufflePos,'authoritative game creation must happen only after shuffle completes');
assert.ok(dealPos>startPos,'deal presentation must happen after the authoritative initial snapshot exists');
assert.ok(readyPos>dealPos,'ready presentation must wait for dealing to finish');
assert.ok(openPos>readyPos,'player interaction must remain closed through the ready presentation');
assert.ok(cpuReadyPos>openPos,'CPU may be released only after the real match-start boundary');
assert.match(gate,/session=null;\s*snapshot=null;[\s\S]*renderCpuPreparationScreenV3\(\);[\s\S]*await showShuffle\(true\);/,'no authoritative game snapshot may exist during shuffle');

console.log('pregame engine-start ordering contract v3: PASS');
