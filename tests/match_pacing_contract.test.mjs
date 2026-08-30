import fs from 'node:fs';
import assert from 'node:assert/strict';

const ts=fs.readFileSync('web/src/match-pacing.ts','utf8');
const cpu=fs.readFileSync('web/src/cpu.ts','utf8');
const css=fs.readFileSync('web/match-pacing.css','utf8');
const mobileCss=fs.readFileSync('web/mobile-landscape-v4.css','utf8');
const html=fs.readFileSync('web/index.html','utf8');

assert.match(html,/match-pacing\.css/,'match animation CSS must be loaded');
assert.match(html,/dist\/match-pacing\.js/,'match animation script must be loaded');
assert.match(ts,/async function playVisibleActionSteps/,'action presentation must be an awaitable blocking sequence');
assert.match(cpu,/await playVisibleActionSteps\(event\)/,'engine event playback must wait for presentation before progressing');
assert.match(ts,/matchRecapBlocking=true/,'player input must be blocked while card motion is active');
assert.match(ts,/stopImmediatePropagation\(\)/,'presentation must prevent accidental actions');
assert.match(ts,/showCardToField/,'played cards must move onto the table rather than appear in a recap modal');
assert.match(ts,/showDeckReveal/,'the deck card must visibly reveal before play continues');
assert.match(ts,/showCaptureMove/,'captured cards must visibly move toward the capturing side');
assert.match(ts,/captureGroups/,'hand and deck captures must be separated by card month when possible');
assert.match(ts,/function isTurnProgressEvent\(event:ActionEvent\)\{return event\.type==="play"\|\|event\.type==="cpu_step";\}/,'only real turn-progress events may drive hand/deck motion');
assert.match(ts,/function hasDeckReveal\(event:ActionEvent\)\{return isTurnProgressEvent\(event\)&&Number\.isInteger\(event\.drawnCard\);\}/,'stale drawnCard data on capture events must never create a phantom deck animation');
assert.match(ts,/if\(hasDeckReveal\(event\)\)\{/,'deck reveal must be gated by the validated deck-event predicate');
assert.match(ts,/if\(!hasHandPlay\(event\)&&!hasDeckReveal\(event\)&&event\.capturedCards\?\.length\)/,'capture-only events must render as capture-only without replaying hand/deck motion');
assert.doesNotMatch(ts,/match-action-recap|match-action-card/,'the old full-board recap card must be removed');
assert.match(css,/\.table-action-layer/,'table motion must have a dedicated non-blocking visual layer');
assert.match(css,/\.table-action-card/,'played-card motion must be rendered on the table');
assert.match(css,/\.table-draw-card/,'draw animation must include a visible card flip');
assert.match(css,/\.table-capture-group/,'capture motion must be rendered toward a capture rail');
assert.doesNotMatch(css,/\.match-action-recap|\.match-action-card/,'old modal-like recap presentation must not remain');
assert.match(css,/\.hand-card-button:disabled,\.field-card-button:disabled\{opacity:1\}/,'temporarily disabled cards must stay opaque');
assert.doesNotMatch(cpu,/if\(event\.capturedCards\?\.length\)toast\(/,'ordinary capture events must not create accumulating toast notifications');
assert.doesNotMatch(cpu,/if\(event\.newYakuMask\)toast\(/,'ordinary yaku events must not create accumulating toast notifications');
assert.match(cpu,/function matchEffectHost\(\)\{return document\.documentElement\.classList\.contains\("mobile-webapp"\)\?app:document\.body;\}/,'mobile match effects must be mounted inside the rotated landscape application');
assert.match(cpu,/matchEffectHost\(\)\.append\(layer\)/,'koi/agari effects must use the landscape-aware effect host');
assert.match(mobileCss,/html\.mobile-webapp\.phone-landscape \.modal:has\(\.koi-choice\)/,'koi/agari choice modal must have phone landscape sizing');
assert.match(mobileCss,/html\.mobile-webapp\.phone-landscape \.agari-yaku-card/,'agari yaku presentation must have phone landscape sizing');

console.log('board-first DS-style match animation contract: PASS');
