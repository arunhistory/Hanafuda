import fs from 'node:fs';
import assert from 'node:assert/strict';

const source=fs.readFileSync('web/src/transition-ui.ts','utf8');
const html=fs.readFileSync('web/index.html','utf8');

assert.match(source,/pendingModeTransition/,'special transition must be driven by the server transition flag');
assert.match(source,/snapshot\.roundIndex\+1<snapshot\.totalRounds/,'victory gate must only stage at the configured final round');
assert.match(source,/perspectiveScores\(snapshot\)/,'victory gate must use the rendered player perspective scores');
assert.match(source,/myScore>opponentScore/,'victory screen must only be shown when the player has actually won on cumulative score');
assert.match(source,/stopImmediatePropagation\(\)/,'the original immediate transition click must be intercepted before collapse');
assert.match(source,/beginImpossibleTransition\(\)/,'the staged victory screen must hand off to the existing forced transition path');
assert.match(source,/hiddenFirstEncounter/,'first-challenge postmatch handling must be isolated to the unreadable first encounter');
assert.match(source,/isUnlocked\(\)/,'first-challenge replay lock must stop applying after the legitimate local unlock is granted');
assert.match(source,/\[data-action='cpu-same'\][^\n]*\.remove\(\)/,'failed first challenge must not offer a direct same-condition replay');
assert.match(source,/プロ対戦設定へ/,'failed first challenge must route the player back toward the Pro setup flow');
assert.match(source,/MutationObserver/,'postmatch synchronization must be event-driven rather than polling');
assert.doesNotMatch(source,/1000|playerTotal|cpuTotal|should_force_impossible|DEVELOPER_MODE_KEY|x-hanafuda-developer/,'public UI must not expose hidden trigger internals or developer secrets');
assert.match(html,/dist\/transition-ui\.js/,'the compiled transition UI module must be loaded by the public page');

console.log('transition UI contract: PASS');
