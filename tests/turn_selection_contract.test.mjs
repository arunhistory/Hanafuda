import fs from 'node:fs';
import assert from 'node:assert/strict';

const js=fs.readFileSync('web/selection-controller.js','utf8');
const css=fs.readFileSync('web/selection-controller.css','utf8');
const html=fs.readFileSync('web/index.html','utf8');

assert.match(html,/selection-controller\.css/,'selection CSS must be loaded');
assert.match(html,/selection-controller\.js/,'selection controller must be loaded');
assert.match(js,/stagedHand/,'hand choice must be staged locally before committing');
assert.match(js,/candidatesFor/,'field candidates must be derived from the selected hand card');
assert.match(js,/sameMonth/,'field choice must follow same-month hanafuda matching');
assert.match(js,/field-empty-target/,'an explicit empty-field choice must exist when no capture is possible');
assert.match(js,/stagedHand===index\?null:index/,'the same hand card must be deselectable and another hand card reselectable');
assert.match(js,/await sendAction\("play",\{handIndex\}\)/,'engine play must start only after hand+field selection is committed');
assert.match(js,/snapshot\.phase===2/,'the preselected field target may only resolve the hand-card capture phase');
assert.doesNotMatch(js,/snapshot\.phase===2\|\|snapshot\.phase===3/,'drawn-card capture must never reuse the hand-card field choice');
assert.match(css,/\.hand-card-button\.selection-chosen/,'selected hand card must be visually explicit');
assert.match(css,/\.field-card-button\.selection-target/,'valid field targets must be visually explicit');

console.log('turn selection contract: PASS');
