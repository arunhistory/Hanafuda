import fs from 'node:fs';
import assert from 'node:assert/strict';

const js=fs.readFileSync('web/turn-flow-v2.js','utf8');
const cpuSrc=fs.readFileSync('web/src/cpu.ts','utf8');
const supabaseFx=fs.readFileSync('web/supabase-effect-source-v1.js','utf8');
const finalFix=fs.readFileSync('web/final-result-fix-v1.js','utf8');
const finalCss=fs.readFileSync('web/final-result-fix-v1.css','utf8');
const roundEnd=fs.readFileSync('web/round-end-boundary-v1.js','utf8');
const pacingSrc=fs.readFileSync('web/src/match-pacing.ts','utf8');
const pregame=fs.readFileSync('web/pregame-gate-v3.js','utf8');
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

// No intermediate decision or yaku popup may remain between agari and settlement.
assert.doesNotMatch(pacingSrc,/showDecision\(/,'redundant koi/agari decision UI must be removed');
assert.doesNotMatch(cpuSrc,/showAgariYaku\(/,'pre-settlement yaku popup must be removed');
assert.doesNotMatch(cpuSrc,/agari-yaku-layer/,'pre-settlement yaku UI layer must not exist in the live CPU flow');
assert.match(finalFix,/koiChoiceCommitted=true;[\s\S]*\.koi-choice[\s\S]*\.remove\(\);[\s\S]*showCallout\("effect\.koikoi\.text"\)[\s\S]*sendAction\("koi"/);
assert.doesNotMatch(finalFix,/const baseChooseKoi=chooseKoi/);

// Final result uses the Supabase-hosted prepared background and readable dark text, without a giant panel.
assert.match(finalFix,/snapshot\?\.phase===6/);
assert.match(finalFix,/app\.classList\.add\("final-result-mode"\)/);
assert.match(finalFix,/FINAL_BG_URL=.*hanafuda-effects\/settlement-bg\.png/);
assert.match(finalFix,/requestIdleCallback|setTimeout\(warm,1200\)/,'final background must warm after match start rather than competing with initial deal');
assert.match(finalFix,/class="final-result-screen"/);
assert.match(finalFix,/class="final-result-content"/);
assert.doesNotMatch(finalFix,/final-result-panel/);
assert.match(finalCss,/\.app-shell\.final-result-mode::before\{[^\n]*hanafuda-effects\/settlement-bg\.png/);
assert.match(finalCss,/\.final-result-content\{[^\n]*background:transparent[^\n]*border:0[^\n]*box-shadow:none/);
assert.match(finalCss,/\.final-result-content h1\{[^\n]*color:#160a05/,'final result title must use high-contrast dark text on the bright gold center');
assert.match(finalCss,/\.final-result-score\{[^\n]*color:#140905/,'final score must use high-contrast dark text');

// Initial round performance path: no real-card DOM before the lightweight deal completes.
const dealIndex=pregame.indexOf('await dealPreparedSnapshotV3();');
const renderIndex=pregame.indexOf('renderMatch();',dealIndex);
assert.ok(dealIndex>=0&&renderIndex>dealIndex,'real initial board must render only after the lightweight deal animation');
assert.match(perfJs,/initial-shuffle-lite/);
assert.match(perfJs,/await delay\(1080\)/);
assert.match(perfJs,/initial-deal-stage/);
assert.match(perfJs,/initial-deal-flight to-opponent/);
assert.match(perfJs,/initial-deal-flight to-field/);
assert.match(perfJs,/initial-deal-flight to-player/);
assert.match(perfJs,/await delay\(620\)/);
assert.match(perfJs,/__hanafudaInitialAnimationPerformanceVersion="2"/);
assert.match(perfCss,/\.initial-deal-stage\{/);
assert.match(perfCss,/contain:layout paint style/);
assert.match(perfCss,/will-change:transform,opacity/);
assert.doesNotMatch(perfCss,/\.initial-deal-lite \.card/,'the lightweight deal must not animate the full real-card DOM');

assert.match(roundEnd,/isFinalRoundSettlement/);
assert.match(roundEnd,/roundIndex\+1>=totalRounds/);
assert.doesNotMatch(roundEnd,/showShuffle|revealRoundDealSequentially|showReadyGate/);

console.log('turn flow v2 contract: PASS');
