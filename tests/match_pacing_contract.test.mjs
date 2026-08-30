import fs from 'node:fs';
import assert from 'node:assert/strict';

const ts=fs.readFileSync('web/src/match-pacing.ts','utf8');
const css=fs.readFileSync('web/match-pacing.css','utf8');
const html=fs.readFileSync('web/index.html','utf8');

assert.match(html,/match-pacing\.css/,'paced match CSS must be loaded');
assert.match(html,/dist\/match-pacing\.js/,'paced match script must be loaded after the base match scripts');
assert.match(ts,/acceptSnapshot=async function/,'each authoritative snapshot must be intercepted for paced presentation');
assert.match(ts,/renderMatch\(\);/,'each event state must be rendered before its animation');
assert.match(ts,/showActionRecap\(event\)/,'each visible action must get an actor/action recap');
assert.match(ts,/あなた|相手/,'the recap must identify who acted');
assert.match(ts,/手札から/,'played cards must be identified');
assert.match(ts,/山札から/,'drawn cards must be identified');
assert.match(ts,/取得/,'captured cards must be identified');
assert.match(ts,/1050/,'capture recaps must remain visible long enough to understand');
assert.match(ts,/await delay\(280\)/,'events must have a readable gap before the next state');
assert.match(css,/\.hand-card-button:disabled,\.field-card-button:disabled\{opacity:1\}/,'cards must not become translucent merely because their button is temporarily disabled');
assert.match(css,/\.match-action-recap/,'the actor/action overlay must have dedicated presentation');

console.log('match pacing and action clarity contract: PASS');
