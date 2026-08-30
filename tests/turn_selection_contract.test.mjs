import fs from 'node:fs';
import assert from 'node:assert/strict';

const js=fs.readFileSync('web/turn-flow-v2.js','utf8');
const supabaseFx=fs.readFileSync('web/supabase-effect-source-v1.js','utf8');
const css=fs.readFileSync('web/turn-flow-v2.css','utf8');
const pacingCss=fs.readFileSync('web/match-pacing.css','utf8');
const overlayCss=fs.readFileSync('web/mobile-overlay-fix-v1.css','utf8');
const html=fs.readFileSync('web/index.html','utf8');

assert.match(html,/turn-flow-v2\.css/,'turn flow v2 CSS must be loaded');
assert.match(html,/turn-flow-v2\.js/,'turn flow v2 controller must be loaded');
assert.match(html,/supabase-effect-source-v1\.js/,'Supabase effect source must load after turn flow');
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
const revealIndex=nextRoundBlock.indexOf('await revealRoundDealSequentially()');
const readyIndex=nextRoundBlock.indexOf('await showReadyGate()');
const releaseIndex=nextRoundBlock.indexOf('await releaseCpuAfterReady()');
assert.ok(shuffleIndex>=0&&commitNextIndex>shuffleIndex,'the next-round snapshot must not enter the DOM before shuffle finishes');
assert.ok(revealIndex>commitNextIndex,'later-round cards must be revealed by an explicit sequential deal after the snapshot exists');
assert.ok(readyIndex>revealIndex,'ready presentation must wait for the sequential deal');
assert.ok(releaseIndex>readyIndex,'CPU release must wait for shuffle, deal and ready presentation on every later round');
assert.match(js,/async function revealRoundDealSequentially\(\)/,'later rounds must have a dedicated deal controller');
assert.match(css,/round-deal-staging[\s\S]*visibility:hidden/,'all later-round cards must start visually hidden');
assert.match(css,/deal-visible/,'each later-round card must be individually revealed');
assert.match(js,/roundTransitionPending/,'later-round transitions must be serialized against double taps');

assert.match(supabaseFx,/supabase-effect-art/,'the live koi/agari path must render only the Supabase effect art');
assert.doesNotMatch(supabaseFx,/dramatic-callout-text/,'the live Supabase effect path must not recreate the legacy callout text');
assert.doesNotMatch(supabaseFx,/dramatic-rays|dramatic-flash/,'the live Supabase effect path must not recreate legacy decorative callout layers');
assert.match(supabaseFx,/supabase-effect-fallback/,'readable text must exist only as an image-error fallback');
assert.match(overlayCss,/\.supabase-effect-layer\{[^\n]*inset:0[^\n]*width:100%[^\n]*height:100%/,'Supabase effect layer must cover the full landscape match host');
assert.match(overlayCss,/\.supabase-effect-art\{[^\n]*left:50%!important;top:50%!important;[^\n]*translate3d\(-50%,-50%,0\)/,'Supabase effect art must be anchored to the exact center of the landscape host');
assert.match(html,/preload[^>]+hanafuda-effects\/koikoi-text\.png/,'koi art must be preloaded from Supabase Storage');
assert.match(html,/preload[^>]+hanafuda-effects\/agari-text\.png/,'agari art must be preloaded from Supabase Storage');
assert.doesNotMatch(js,/Array\.from\(\{length:22\}/,'koi/agari must not recreate the old 22-node particle burst');
assert.match(pacingCss,/\.dramatic-callout-layer\{background:transparent!important;backdrop-filter:none!important/,'legacy fallback callouts must keep the live table visible without a blurred dark backdrop');
assert.match(pacingCss,/\.agari-yaku-layer\{background:transparent!important/,'agari yaku must not fall back to the old dark backdrop');

console.log('turn flow v2 contract: PASS');
