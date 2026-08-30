import fs from 'node:fs';
import assert from 'node:assert/strict';

const cpu=fs.readFileSync('web/src/cpu.ts','utf8');
const pacing=fs.readFileSync('web/src/match-pacing.ts','utf8');
const css=fs.readFileSync('web/mobile-match-visibility-v2.css','utf8');
const html=fs.readFileSync('web/index.html','utf8');

const renderPos=cpu.indexOf('renderMatch();\n    await animateNewRoundIfNeeded(true);');
const readyLabelPos=cpu.indexOf('await showReadyGate();',renderPos);
const readyReleasePos=cpu.indexOf('await releaseCpuAfterReady();',readyLabelPos);
assert.ok(renderPos>=0&&readyLabelPos>renderPos&&readyReleasePos>readyLabelPos,'CPU must remain blocked until shuffle/deal and explicit ready presentation complete');
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

console.log('mobile two-row field and explicit CPU-ready presentation gate: PASS');
