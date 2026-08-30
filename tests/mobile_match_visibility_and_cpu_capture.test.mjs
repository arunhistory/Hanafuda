import fs from 'node:fs';
import assert from 'node:assert/strict';

const cpu=fs.readFileSync('web/src/cpu.ts','utf8');
const css=fs.readFileSync('web/mobile-match-visibility-v2.css','utf8');
const html=fs.readFileSync('web/index.html','utf8');

const renderPos=cpu.indexOf('renderMatch();\n    await animateNewRoundIfNeeded(true);');
const eventPos=cpu.indexOf('await acceptApiEvents(startEvents);');
assert.ok(renderPos>=0&&eventPos>renderPos,'CPU events must not play before shuffle/deal completes');
assert.match(cpu,/function newlyCaptured\(/,'capture presentation must recover captured cards from snapshot deltas');
assert.match(cpu,/presentationEvent\(/,'all action events must be normalized for presentation');
assert.match(cpu,/newlyCaptured\(old\.captured\[actorSeat\]/,'CPU capture recovery must compare actor capture piles');
assert.match(cpu,/await playVisibleActionSteps\(event\)/,'CPU progression must wait for visible action playback');
assert.match(html,/mobile-match-visibility-v2\.css/,'two-row readability stylesheet must be loaded');
assert.doesNotMatch(html,/mobile-match-visibility-v1\.css/,'obsolete readability stylesheet must not remain active');
assert.match(css,/grid-template-rows:repeat\(2,minmax\(0,1fr\)\)/,'field must remain exactly two rows');
assert.match(css,/grid-auto-flow:column/,'field cards must fill the fixed two-row layout by columns');
assert.match(css,/grid-auto-columns:minmax\(64px,1fr\)/,'field width must adapt horizontally instead of free positioning');
assert.match(css,/field-card-button \.card\{height:clamp\(108px/,'field cards must remain readable on mobile');
assert.match(css,/hand-card-button \.card\{height:clamp\(104px/,'player hand must remain readable');

console.log('mobile two-row field and blocking CPU presentation: PASS');
