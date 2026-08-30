import fs from 'node:fs';
import assert from 'node:assert/strict';

const js=fs.readFileSync('web/turn-flow-v2.js','utf8');
const css=fs.readFileSync('web/turn-flow-v2.css','utf8');
const pacingCss=fs.readFileSync('web/match-pacing.css','utf8');
const html=fs.readFileSync('web/index.html','utf8');

assert.match(html,/turn-flow-v2\.css/,'turn flow v2 CSS must be loaded');
assert.match(html,/turn-flow-v2\.js/,'turn flow v2 controller must be loaded');
assert.doesNotMatch(html,/selection-controller\.(?:css|js)/,'legacy selection controller must not be referenced');
assert.match(js,/stagedHand/,'hand choice must be staged locally before committing');
assert.match(js,/candidatesFor/,'field candidates must be derived from the selected hand card');
assert.match(js,/sameMonth/,'field choice must follow same-month hanafuda matching');
assert.match(js,/field-empty-target/,'an explicit empty-field choice must exist when no capture is possible');
assert.match(js,/stagedHand===index\?null:index/,'the same hand card must be deselectable and another hand card reselectable');
assert.match(js,/await sendAction\("play",\{handIndex\}\)/,'engine play must start only after hand+field selection is committed');
assert.match(js,/snapshot\.phase===2/,'the preselected field target may only resolve the hand-card capture phase');
assert.doesNotMatch(js,/snapshot\.phase===2\|\|snapshot\.phase===3/,'drawn-card capture must never reuse the hand-card field choice');
assert.match(js,/renderMatch\(\);\s*await animateNewRoundIfNeeded\(true\);\s*await acceptApiEvents/,'shuffle and dealing must finish before startup CPU events are replayed');
assert.match(js,/__hanafudaTurnFlowVersion="2"/,'v2 runtime marker must be present for deployment verification');
assert.match(css,/\.hand-card-button\.selection-chosen/,'selected hand card must be visually explicit');
assert.match(css,/\.field-card-button\.selection-target/,'valid field targets must be visually explicit');

const nextRoundStart=js.indexOf('action!=="next_round"');
const nextRoundEnd=js.indexOf('showCallout=async function',nextRoundStart);
assert.ok(nextRoundStart>=0&&nextRoundEnd>nextRoundStart,'CPU next-round presentation override must exist');
const nextRoundBlock=js.slice(nextRoundStart,nextRoundEnd);
const shuffleIndex=nextRoundBlock.indexOf('await showShuffle(false)');
const commitNextIndex=nextRoundBlock.indexOf('snapshot=nextSnapshot');
const dealingIndex=nextRoundBlock.indexOf('board?.classList.add("dealing")');
const readyIndex=nextRoundBlock.indexOf('await showReadyGate()');
const releaseIndex=nextRoundBlock.indexOf('await releaseCpuAfterReady()');
assert.ok(shuffleIndex>=0&&commitNextIndex>shuffleIndex,'the next-round snapshot must not enter the DOM before shuffle finishes');
assert.ok(dealingIndex>commitNextIndex,'dealing must begin only after the post-shuffle round snapshot is installed');
assert.ok(readyIndex>dealingIndex,'ready presentation must wait for dealing');
assert.ok(releaseIndex>readyIndex,'CPU release must wait for shuffle, deal and ready presentation on every later round');
assert.match(js,/roundTransitionPending/,'later-round transitions must be serialized against double taps');
assert.match(js,/dramatic-callout-layer/,'koi/agari must use the lightweight dramatic callout path');
assert.doesNotMatch(js,/Array\.from\(\{length:22\}/,'koi/agari must not recreate the old 22-node particle burst');
assert.match(pacingCss,/\.dramatic-callout-layer\{background:transparent!important;backdrop-filter:none!important/,'dramatic callouts must keep the live table visible without a blurred dark backdrop');
assert.match(pacingCss,/\.dramatic-callout-layer \.dramatic-callout::before\{display:none!important\}/,'the legacy nested callout background must be removed');
assert.match(pacingCss,/\.agari-yaku-layer\{background:transparent!important/,'agari yaku must not fall back to the old dark backdrop');

console.log('turn flow v2 contract: PASS');
