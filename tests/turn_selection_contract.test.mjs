import fs from 'node:fs';
import assert from 'node:assert/strict';

const js=fs.readFileSync('web/turn-flow-v2.js','utf8');
const supabaseFx=fs.readFileSync('web/supabase-effect-source-v1.js','utf8');
const finalFix=fs.readFileSync('web/final-result-fix-v1.js','utf8');
const finalCss=fs.readFileSync('web/final-result-fix-v1.css','utf8');
const roundEnd=fs.readFileSync('web/round-end-boundary-v1.js','utf8');
const pacingSrc=fs.readFileSync('web/src/match-pacing.ts','utf8');
const perfJs=fs.readFileSync('web/initial-animation-performance-v1.js','utf8');
const perfCss=fs.readFileSync('web/initial-animation-performance-v1.css','utf8');
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
assert.match(html,/initial-animation-performance-v1\.css/);
assert.match(html,/initial-animation-performance-v1\.js/);
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

// No intermediate koi/agari decision label may appear after the player already chose.
assert.doesNotMatch(pacingSrc,/showDecision\(/,'redundant koi/agari decision UI must be removed');
assert.doesNotMatch(pacingSrc,/event\.type==="koi"[\s\S]*table-decision-label/,'koi action replay must not recreate a decision UI');
assert.match(finalFix,/koiChoiceCommitted=true;[\s\S]*\.koi-choice[\s\S]*\.remove\(\);[\s\S]*showCallout\("effect\.koikoi\.text"\)[\s\S]*sendAction\("koi"/);
assert.doesNotMatch(finalFix,/const baseChooseKoi=chooseKoi/);

// Final result uses the prepared background directly: no giant panel/frame obscuring it.
assert.match(finalFix,/snapshot\?\.phase===6/);
assert.match(finalFix,/app\.classList\.add\("final-result-mode"\)/);
assert.match(finalFix,/class="final-result-screen"/);
assert.match(finalFix,/class="final-result-content"/);
assert.doesNotMatch(finalFix,/final-result-panel/);
assert.match(finalCss,/\.app-shell\.final-result-mode::before\{[^\n]*var\(--asset-bg-settlement\)/);
assert.match(finalCss,/\.final-result-content\{[^\n]*background:transparent[^\n]*border:0[^\n]*box-shadow:none/);

// Initial round performance path: two-card shuffle and only three group-level deal transitions.
assert.match(perfJs,/initial-shuffle-lite/);
assert.match(perfJs,/shuffle-card[\s\S]*shuffle-card/);
assert.doesNotMatch(perfJs,/shuffle-card[\s\S]*shuffle-card[\s\S]*shuffle-card/,'initial shuffle must not animate four stacked cards');
assert.match(perfJs,/initial-deal-lite/);
assert.match(perfJs,/await delay\(690\)/);
assert.match(perfCss,/\.opponent-zone>\.hand-row/);
assert.match(perfCss,/\.field-wrap/);
assert.match(perfCss,/\.player-zone>\.hand-row/);
assert.match(perfCss,/filter:none!important/);

assert.match(roundEnd,/isFinalRoundSettlement/);
assert.match(roundEnd,/roundIndex\+1>=totalRounds/);
assert.doesNotMatch(roundEnd,/showShuffle|revealRoundDealSequentially|showReadyGate/);

console.log('turn flow v2 contract: PASS');
