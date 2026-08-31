import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('web/index.html','utf8');
const gate=fs.readFileSync('web/src/pregame-gate-v3.ts','utf8');
const core=fs.readFileSync('web/src/core.ts','utf8');
const views=fs.readFileSync('web/src/views.ts','utf8');

assert.match(html,/\.\/dist\/pregame-gate-v3\.js/,'the generated authoritative pregame gate must be loaded');
assert.doesNotMatch(html,/src="\.\/pregame-gate-v3\.js"/,'the handwritten pregame gate must not be loaded');
assert.doesNotMatch(html,/pregame-gate-v2\.js/,'the obsolete pregame gate must not be loaded');
assert.ok(fs.existsSync('web/dist/pregame-gate-v3.js'),'the generated pregame gate artifact must exist');
assert.match(gate,/startCpuSequencedV3\(\)/,'v3 must own the sequenced CPU start path');
assert.match(gate,/stopImmediatePropagation\(\)/,'v3 must block every legacy start click handler');
assert.match(gate,/addEventListener\("click"[\s\S]*true\);/,'the pregame start interception must run in capture phase');

const shufflePos=gate.indexOf('await showShuffle(true);');
const modePos=gate.indexOf('const mode=await api("/api/mode/start"');
const startPos=gate.indexOf('const started=await api("/api/cpu/start"');
const dealPos=gate.indexOf('await dealPreparedSnapshotV3();');
const readyVisualPos=gate.indexOf('await showReadyGate();');
const cpuReadyPos=gate.indexOf('await releaseCpuAfterReadyV3();',readyVisualPos);
const openPos=gate.indexOf('matchInteractionReady=true;',cpuReadyPos);

assert.ok(shufflePos>=0,'shuffle must exist');
assert.ok(modePos>shufflePos,'mode authority must not start until shuffle completes');
assert.ok(startPos>modePos,'CPU game creation must immediately follow mode authority after shuffle');
assert.ok(dealPos>startPos,'deal presentation must happen after the authoritative initial snapshot exists');
assert.ok(readyVisualPos>dealPos,'ready presentation must wait for dealing to finish');
assert.ok(cpuReadyPos>readyVisualPos,'server-side CPU release must wait for ready presentation');
assert.ok(openPos>cpuReadyPos,'player interaction must not open before the ready handshake succeeds');
assert.match(gate,/session=null;\s*snapshot=null;[\s\S]*renderCpuPreparationScreenV3\(\);[\s\S]*await showShuffle\(true\);/,'no authoritative game snapshot may exist during shuffle');
assert.match(gate,/if\(!authoritativeGameCreated\)[\s\S]*stack=\["home","cpu-setup"\][\s\S]*else[\s\S]*renderMatch\(\)/,'a post-deal ready failure must preserve the created game instead of returning to setup');

assert.doesNotMatch(views,/function renderCpuSetup\(\)[\s\S]{0,2000}<select id="cpu-mode"/,'CPU setup must not use a native popup select for difficulty');
assert.match(views,/data-cpu-mode=/,'CPU setup must expose in-canvas difficulty choices');
assert.match(views,/data-cpu-rounds=/,'CPU setup must expose in-canvas round choices');
assert.match(views,/function dealerChoices\(\)\{return '<span class="setup-choice selected" aria-current="true">ランダム<\/span>';\}/,'dealer UI must expose only the fixed standard random choice until additional choices are specified');
assert.doesNotMatch(views,/data-cpu-dealer=/,'unspecified dealer choices must not be interactive');
assert.match(core,/type FirstDealer = -1 \| 0 \| 1;/,'dealer transport remains structurally extensible without exposing unspecified choices');
assert.match(core,/firstDealer:-1/,'dealer setting must default safely to random');
assert.doesNotMatch(core,/value\?\.firstDealer/,'legacy persisted non-random dealer choices must not override the fixed standard');
assert.match(gate,/const firstDealer=settings\.firstDealer;/,'pregame must use the canonical settings value');
assert.ok((gate.match(/firstDealer/g)||[]).length>=5,'canonical firstDealer must still flow through both normal and impossible CPU start payloads and session state');
assert.doesNotMatch(gate,/hanafuda\.cpu\.firstDealer/,'dealer selection must not create a second localStorage source of truth');

console.log('pregame engine-start ordering, generated runtime and canonical dealer contract v3: PASS');
