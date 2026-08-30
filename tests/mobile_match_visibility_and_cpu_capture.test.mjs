import fs from 'node:fs';
import assert from 'node:assert/strict';

const core=fs.readFileSync('web/src/core.ts','utf8');
const cpu=fs.readFileSync('web/src/cpu.ts','utf8');
const pacing=fs.readFileSync('web/src/match-pacing.ts','utf8');
const css=fs.readFileSync('web/mobile-match-visibility-v2.css','utf8');
const html=fs.readFileSync('web/index.html','utf8');

assert.match(core,/let matchInteractionReady=true;/,'frontend must have an explicit match-start interaction gate separate from network busy state');
assert.match(core,/if\(session\?\.kind==="cpu"&&!matchInteractionReady\)return "対局準備中";/,'phase 1 must not leak normal turn instructions while shuffle/deal is still running');
const startGate=cpu.indexOf('matchInteractionReady=false;');
const renderPos=cpu.indexOf('renderMatch();',startGate);
const shufflePos=cpu.indexOf('await animateNewRoundIfNeeded(true);',renderPos);
const readyLabelPos=cpu.indexOf('await showReadyGate();',shufflePos);
const openGatePos=cpu.indexOf('matchInteractionReady=true;',readyLabelPos);
const readyReleasePos=cpu.indexOf('await releaseCpuAfterReady();',openGatePos);
assert.ok(startGate>=0&&renderPos>startGate&&shufflePos>renderPos&&readyLabelPos>shufflePos&&openGatePos>readyLabelPos&&readyReleasePos>openGatePos,'CPU and player interaction must remain locked through render, shuffle, deal and ready presentation, and unlock only before the explicit CPU ready release');
assert.match(cpu,/if\(!matchInteractionReady\)throw new Error\("MATCH_NOT_READY"\)/,'CPU ready endpoint must be unreachable while the frontend start gate is closed');
assert.match(cpu,/openingNextCpuRound[\s\S]*matchInteractionReady=false;[\s\S]*await animateNewRoundIfNeeded\(false\);[\s\S]*await showReadyGate\(\);[\s\S]*matchInteractionReady=true;[\s\S]*await releaseCpuAfterReady\(\);/,'each later CPU round must close the same gate until its shuffle/deal/ready sequence completes');
assert.match(cpu,/matchInteractionReady=false;[\s\S]*session\.mode="impossible"[\s\S]*await animateNewRoundIfNeeded\(true\);[\s\S]*await showReadyGate\(\);[\s\S]*matchInteractionReady=true;[\s\S]*await releaseCpuAfterReady\(\);/,'forced impossible transition must also remain locked until presentation is complete');
assert.match(cpu,/api\("\/api\/cpu\/ready"/,'CPU release must use the dedicated ready endpoint');
assert.match(cpu,/function newlyCaptured\(/,'capture presentation must recover captured cards from snapshot deltas');
assert.match(cpu,/presentationEvent\(/,'all action events must be normalized for presentation');
assert.match(cpu,/newlyCaptured\(old\.captured\[actorSeat\]/,'CPU capture recovery must compare actor capture piles');
assert.match(cpu,/await playVisibleActionSteps\(event,nextState\)/,'CPU progression must wait for visible action playback with the upcoming authoritative state');
assert.match(pacing,/reflectCapturedRail\(event,nextState\)/,'captured cards must move into the capture rail at capture completion');
assert.match(html,/mobile-match-visibility-v2\.css/,'two-row readability stylesheet must be loaded');
assert.doesNotMatch(html,/mobile-match-visibility-v1\.css/,'obsolete readability stylesheet must not remain active');
assert.match(css,/grid-template-rows:repeat\(2,minmax\(0,1fr\)\)/,'field must remain exactly two rows');
assert.match(css,/grid-auto-flow:column/,'field cards must fill the fixed two-row layout by columns');
assert.match(css,/grid-auto-columns:minmax\(64px,1fr\)/,'field width must adapt horizontally instead of free positioning');
assert.match(css,/field-card-button \.card\{height:clamp\(108px/,'field cards must remain readable on mobile');
assert.match(css,/hand-card-button \.card\{height:clamp\(104px/,'player hand must remain readable');

console.log('mobile two-row field and full pre-match interaction gate: PASS');
