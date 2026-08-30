import fs from 'node:fs';
import assert from 'node:assert/strict';

const ts=fs.readFileSync('web/src/match-pacing.ts','utf8');
const cpu=fs.readFileSync('web/src/cpu.ts','utf8');
const css=fs.readFileSync('web/match-pacing.css','utf8');
const html=fs.readFileSync('web/index.html','utf8');

assert.match(html,/match-pacing\.css/,'paced match CSS must be loaded');
assert.match(html,/dist\/match-pacing\.js/,'paced match script must be loaded after the base match scripts');
assert.match(ts,/async function playVisibleActionSteps/,'visible action pacing must be an awaitable blocking sequence');
assert.match(cpu,/await playVisibleActionSteps\(event\)/,'engine event playback must wait for the visible sequence before progressing');
assert.match(ts,/matchRecapBlocking=true/,'player input must be blocked while a visible step is active');
assert.match(ts,/stopImmediatePropagation\(\)/,'visible playback must prevent accidental next actions');
assert.match(ts,/あなた|相手/,'the recap must identify who acted');
assert.match(ts,/手札から/,'played cards must be identified');
assert.match(ts,/場札を取得/,'hand-card captures must be a separate visible step');
assert.match(ts,/山札から/,'drawn cards must be a separate visible step');
assert.match(ts,/1250/,'card play and draw steps must remain visible long enough to understand');
assert.match(ts,/1350/,'capture steps must remain visible long enough to understand');
assert.match(ts,/delay\(650\)/,'the next turn must not begin immediately after the last visible step');
assert.match(css,/\.hand-card-button:disabled,\.field-card-button:disabled\{opacity:1\}/,'cards must not become translucent merely because their button is temporarily disabled');
assert.match(css,/\.match-action-recap/,'the actor/action overlay must have dedicated presentation');

console.log('blocking stepwise match pacing contract: PASS');
