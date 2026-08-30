import fs from 'node:fs';
import assert from 'node:assert/strict';

const cpu=fs.readFileSync('web/src/cpu.ts','utf8');
const css=fs.readFileSync('web/mobile-match-visibility-v1.css','utf8');
const html=fs.readFileSync('web/index.html','utf8');

const renderPos=cpu.indexOf('renderMatch();\n    await animateNewRoundIfNeeded(true);');
const eventPos=cpu.indexOf('await acceptApiEvents(startEvents);');
assert.ok(renderPos>=0&&eventPos>renderPos,'CPU events must not play before shuffle/deal completes');
assert.match(cpu,/function newlyCaptured\(/,'capture presentation must recover captured cards from snapshot deltas');
assert.match(cpu,/presentationEvent\(/,'all action events must be normalized for presentation');
assert.match(cpu,/newlyCaptured\(old\.captured\[actorSeat\]/,'CPU capture recovery must compare actor capture piles');
assert.match(cpu,/相手.*が取得|あなた.*が取得/,'capture feedback must name the acting side');
assert.match(html,/mobile-match-visibility-v1\.css/,'new readability stylesheet must be loaded');
assert.match(css,/field-card-button \.card\{height:clamp\(104px/,'field cards must be substantially larger on mobile');
assert.match(css,/hand-card-button \.card\{height:clamp\(104px/,'player hand must remain readable');
assert.match(css,/captured-row \.card\{height:clamp\(40px/,'capture rails must be readable');

console.log('mobile match visibility and CPU capture presentation: PASS');
