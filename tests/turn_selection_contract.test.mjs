import fs from 'node:fs';
import assert from 'node:assert/strict';

const js=fs.readFileSync('web/turn-flow-v2.js','utf8');
const supabaseFx=fs.readFileSync('web/supabase-effect-source-v1.js','utf8');
const finalFix=fs.readFileSync('web/final-result-fix-v1.js','utf8');
const finalCss=fs.readFileSync('web/final-result-fix-v1.css','utf8');
const roundEnd=fs.readFileSync('web/round-end-boundary-v1.js','utf8');
const css=fs.readFileSync('web/turn-flow-v2.css','utf8');
const pacingCss=fs.readFileSync('web/match-pacing.css','utf8');
const overlayCss=fs.readFileSync('web/mobile-overlay-fix-v1.css','utf8');
const html=fs.readFileSync('web/index.html','utf8');

assert.match(html,/turn-flow-v2\.css/);
assert.match(html,/turn-flow-v2\.js/);
assert.match(html,/supabase-effect-source-v1\.js/);
assert.match(html,/final-result-fix-v1\.js/);
assert.match(html,/final-result-fix-v1\.css/);
assert.match(html,/round-end-boundary-v1\.js/);
assert.doesNotMatch(html,/selection-controller\.(?:css|js)/);
assert.match(js,/stagedHand/);
assert.match(js,/candidatesFor/);
assert.match(js,/sameMonth/);
assert.match(js,/field-empty-target/);
assert.match(js,/stagedHand===index\?null:index/);
assert.match(js,/await sendAction\("play",\{handIndex\}\)/);
assert.match(js,/snapshot\.phase===2/);
assert.doesNotMatch(js,/snapshot\.phase===2\|\|snapshot\.phase===3/);
assert.match(js,/__hanafudaTurnFlowVersion="2"/);
assert.match(css,/\.hand-card-button\.selection-chosen/);
assert.match(css,/\.field-card-button\.selection-target/);

const nextRoundStart=js.indexOf('action!=="next_round"');
const nextRoundEnd=js.indexOf('showCallout=async function',nextRoundStart);
assert.ok(nextRoundStart>=0&&nextRoundEnd>nextRoundStart);
const nextRoundBlock=js.slice(nextRoundStart,nextRoundEnd);
assert.ok(nextRoundBlock.indexOf('clearRoundSettlementOverlay()')>=0);
assert.ok(nextRoundBlock.indexOf('await showShuffle(false)')>nextRoundBlock.indexOf('clearRoundSettlementOverlay()'));
assert.ok(nextRoundBlock.indexOf('const result=await api("/api/cpu/action"')>nextRoundBlock.indexOf('await showShuffle(false)'));
assert.ok(nextRoundBlock.indexOf('await revealRoundDealSequentially()')>nextRoundBlock.indexOf('snapshot=nextSnapshot'));
assert.ok(nextRoundBlock.indexOf('await showReadyGate()')>nextRoundBlock.indexOf('await revealRoundDealSequentially()'));
assert.ok(nextRoundBlock.indexOf('await releaseCpuAfterReady()')>nextRoundBlock.indexOf('await showReadyGate()'));
assert.match(css,/round-deal-staging[\s\S]*visibility:hidden/);
assert.match(css,/deal-visible/);

assert.match(supabaseFx,/supabase-effect-art/);
assert.doesNotMatch(supabaseFx,/dramatic-callout-text/);
assert.doesNotMatch(supabaseFx,/dramatic-rays|dramatic-flash/);
assert.match(supabaseFx,/supabase-effect-fallback/);
assert.match(overlayCss,/\.supabase-effect-layer\{[^\n]*inset:0[^\n]*width:100%[^\n]*height:100%/);
assert.match(overlayCss,/\.supabase-effect-art\{[^\n]*left:50%!important;top:50%!important;[^\n]*translate3d\(-50%,-50%,0\)/);
assert.match(html,/preload[^>]+hanafuda-effects\/koikoi-text\.png/);
assert.match(html,/preload[^>]+hanafuda-effects\/agari-text\.png/);
assert.doesNotMatch(js,/Array\.from\(\{length:22\}/);
assert.match(pacingCss,/\.dramatic-callout-layer\{background:transparent!important;backdrop-filter:none!important/);

// Koi decision order: chooser first, remove it on commit, then show the chosen animation, then send the action.
assert.match(finalFix,/koiChoiceCommitted=true;[\s\S]*\.koi-choice[\s\S]*\.remove\(\);[\s\S]*showCallout\("effect\.koikoi\.text"\)[\s\S]*sendAction\("koi"/);
assert.doesNotMatch(finalFix,/const baseChooseKoi=chooseKoi/,'legacy nested koi wrapper must be removed');
assert.match(finalFix,/if\(koiChoiceCommitted\)[\s\S]*\.koi-choice[\s\S]*\.remove\(\)/,'rerenders during the committed choice must not recreate the chooser');

// Final result must be a genuinely separate screen/background, not a .screen overlay on the match background.
assert.match(finalFix,/snapshot\?\.phase===6/);
assert.match(finalFix,/app\.classList\.add\("final-result-mode"\)/);
assert.match(finalFix,/removeTransientMatchOverlays/);
assert.match(finalFix,/class="final-result-screen"/);
assert.doesNotMatch(finalFix,/screenClass\("final-result-screen"\)/);
assert.doesNotMatch(finalFix,/class="modal-layer"/);
assert.match(finalCss,/\.app-shell\.final-result-mode::before\{[^\n]*var\(--asset-bg-settlement\)/,'final result shell must use the settlement background asset');
assert.match(finalCss,/\.final-result-screen::before\{content:none!important/,'normal .screen background pseudo layer must not survive on final result');
assert.match(finalCss,/\.final-result-screen\{position:relative;[^\n]*background:transparent!important/);

assert.match(roundEnd,/isFinalRoundSettlement/);
assert.match(roundEnd,/roundIndex\+1>=totalRounds/);
assert.doesNotMatch(roundEnd,/showShuffle|revealRoundDealSequentially|showReadyGate/);

console.log('turn flow v2 contract: PASS');
