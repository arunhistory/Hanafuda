import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const html=fs.readFileSync(path.join(root,'web','index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'web','styles.css'),'utf8');
const experienceCss=fs.readFileSync(path.join(root,'web','experience.css'),'utf8');
const ts=fs.readdirSync(path.join(root,'web','src')).filter(x=>x.endsWith('.ts')).sort().map(x=>fs.readFileSync(path.join(root,'web','src',x),'utf8')).join('\n');
const cpuSrc=fs.readFileSync(path.join(root,'web','src','cpu.ts'),'utf8');
const turnFlowSrc=fs.readFileSync(path.join(root,'web','src','turn-flow-v2.ts'),'utf8');
const perfSrc=fs.readFileSync(path.join(root,'web','src','initial-animation-performance-v1.ts'),'utf8');
const finalFix=fs.readFileSync(path.join(root,'web','src','final-result-fix-v1.ts'),'utf8');
const finalCss=fs.readFileSync(path.join(root,'web','final-result-fix-v1.css'),'utf8');
const audioRoot=path.join(root,'web','src','audio-driver');
const audioControl=fs.readFileSync(path.join(audioRoot,'control.ts'),'utf8');
const audioUnits=['driver','common','local'];
const jsFiles=['core.js','views.js','cpu.js','online.js','experience.js','match-pacing.js','pregame-gate-v3.js','turn-flow-v2.js','supabase-runtime-assets-v1.js','supabase-effect-source-v1.js','final-result-fix-v1.js','round-end-boundary-v1.js','initial-animation-performance-v1.js','audio-driver/control.js','audio-driver/driver/driver.js','audio-driver/common/common.js','audio-driver/local/local.js'];
const js=jsFiles.filter(x=>fs.existsSync(path.join(root,'web','dist',x))).map(x=>fs.readFileSync(path.join(root,'web','dist',x),'utf8')).join('\n');

const checks=[
  ['web app has no manifest or service worker',!html.includes('manifest')&&!ts.includes('serviceWorker')],
  ['footer copyright is directly above ad slot',/class="copyright">©ある〜ん<\/div>\s*<div class="ad-bar"/.test(html)],
  ['ad bar reserves safe-area-aware layout',css.includes('--footer-height')&&css.includes('env(safe-area-inset-bottom)')],
  ['responsive portrait and landscape rules exist',css.includes('@media (max-width:720px)')&&css.includes('@media (orientation:landscape)')],
  ['settings are compact and scroll-safe',css.includes('.settings-grid')&&css.includes('max-height:min(78dvh,720px);overflow:auto')],
  ['settings rules yaku hierarchy exists',ts.includes('"rules" | "yaku" | "match"')&&ts.includes('data-nav="rules">詳細ルール')&&ts.includes('data-nav="yaku">得点・役確認')&&ts.includes('function renderYakuScreen()')],
  ['detailed rule expansion is limited to rules screen',ts.includes('if(currentScreen()!=="rules")return;')],
  ['back navigation uses stack not hardwired home',ts.includes('if(stack.length>1)stack.pop()')&&ts.includes('function goHome()')],
  ['pause menu includes all required items',['再開','役の得点と組み合わせ','現状','履歴','ルール確認','設定','諦める'].every(x=>ts.includes(x))],
  ['give up has confirmation',ts.includes('対局を諦めますか？')&&ts.includes('confirm-giveup')],
  ['current state shows both public captured cards and yaku',ts.includes('function decorateStateModal()')&&ts.includes('公開済み取得札')&&ts.includes('あなた：${escapeHtml(myYaku)}')&&ts.includes('相手：${escapeHtml(theirYaku)}')&&experienceCss.includes('.state-cards')&&experienceCss.includes('overflow-x:auto')],
  ['history is current-round memory only',ts.includes('let roundHistory:string[]=[]')&&ts.includes('roundHistory=[];currentRound=-1')&&!ts.includes('localStorage.setItem("history')],
  ['history records played drawn captured yaku koi',ts.includes('を出した')&&ts.includes('山札から')&&ts.includes('を取得')&&ts.includes('役成立:')&&ts.includes('こいこい')],
  ['CPU koi decision is recorded from authoritative cpu_step event',cpuSrc.includes('event.type==="cpu_step"&&typeof event.chooseKoi==="boolean"')&&cpuSrc.includes('if(decidedKoi)bits.push(event.chooseKoi?"こいこい":"あがり")')],
  ['opponent koi is visibly presented before later settlement',cpuSrc.includes('const opponentDecision=Number(event.actor)===opponentSeat()')&&cpuSrc.includes('opponentDecision&&event.chooseKoi===true')&&cpuSrc.includes('await showCallout("effect.koikoi.text")')],
  ['asset runtime uses registry purpose ids',ts.includes('asset-registry.json')&&ts.includes('background.match.normal')&&ts.includes('cards.generated')&&!css.includes('../assets/')],
  ['normal CPU list excludes hidden mode until local unlock',ts.includes('isUnlocked()?["beginner","amateur","pro","impossible"]:["beginner","amateur","pro"]')],
  ['hidden trigger internals are absent from public frontend',!ts.includes('playerTotal')&&!ts.includes('cpuTotal')&&!ts.includes('should_force_impossible')],
  ['developer secret or developer header is absent from frontend',!ts.includes('DEVELOPER_MODE_KEY')&&!ts.includes('x-hanafuda-developer')],
  ['forced transition uses explicit CPU transition endpoint',ts.includes('/api/cpu/transition')&&ts.includes('showCollapse()')],
  ['forced transition cannot be manually accelerated',ts.includes('button.disabled=true')&&ts.includes('scheduleForcedTransition()')&&ts.includes('hold=settings.skipNormalAnimations?1600:4300')],
  ['first hidden encounter name is obscured',ts.includes('hiddenFirstEncounter?"▧▒░█?▒":"人知不能"')],
  ['first hidden loss cannot immediately retry hidden mode',ts.includes('firstHiddenAttempt=session?.kind==="cpu"&&session.mode==="impossible"&&!isUnlocked()')&&ts.includes('[data-action=\'cpu-reconfigure\']')&&ts.includes('[data-action=\'cpu-same\']')],
  ['local unlock is written only from server grant path',ts.includes('if(ready.data.unlockGranted===true)grantUnlock()')&&ts.includes('if(result.data.unlockGranted===true)grantUnlock()')&&!ts.includes('grantUnlock();\n  await sendAction')],
  ['shuffle runs for every newly detected round',ts.includes('currentRound!==snapshot.roundIndex')&&(ts.includes('await showShuffle()')||ts.includes('await showShuffle(force)'))],
  ['online new epoch resets round presentation before rematch',ts.includes('const epochChanged=')&&ts.includes('if(epochChanged){roundHistory=[];currentRound=-1;}')&&ts.includes('animateNewRoundIfNeeded(!prior||epochChanged)')],
  ['initial shuffle uses lightweight runtime path',perfSrc.includes('initial-shuffle-lite')&&perfSrc.includes('await delay(1080)')],
  ['initial deal uses lightweight placeholder groups',perfSrc.includes('initial-deal-stage')&&perfSrc.includes('to-opponent')&&perfSrc.includes('to-field')&&perfSrc.includes('to-player')],
  ['capture animation exists',ts.includes('showCaptureTrail')&&css.includes('@keyframes captureFly')],
  ['koi and agari use registered text assets',ts.includes('effect.koikoi.text')&&ts.includes('effect.agari.text')],
  ['important callout text is held beyond one second',ts.includes('await delay(1850)')],
  ['agari proceeds directly to settlement without yaku popup',ts.includes('await showCallout("effect.agari.text");')&&!ts.includes('showAgariYaku(')&&!/(?:className|class)\s*=\s*["'`]agari-yaku-layer/.test(ts)],
  ['simultaneous deal specials display both sides',ts.includes('function decorateSimultaneousSpecials(breakdown:HTMLElement)')&&ts.includes('snapshot.lastRoundWinner!==2')&&ts.includes('`あなた: ${mine} / 相手: ${theirs}`')],
  ['settlement order includes yaku base multiplier round cumulative next dealer',['成立役','基礎点','こいこい倍率','局得点','累計点','次局親'].every(x=>ts.includes(x))],
  ['settlement controls wait for the next-dealer row',experienceCss.includes('settlementControlsReveal .42s ease 3.18s both')],
  ['final result uses Supabase background warmed after play starts',finalFix.includes('hanafuda-effects/settlement-bg.png')&&finalFix.includes('requestIdleCallback')&&finalCss.includes('hanafuda-effects/settlement-bg.png')],
  ['final result text is high contrast on gold background',finalCss.includes('color:#160a05')&&finalCss.includes('color:#140905')],
  ['corrupted play stays low intensity and strengthens only on round change',experienceCss.includes('.screen.corrupted::after')&&experienceCss.includes('.app-shell.corrupted-round-shift::after')&&ts.includes('app.classList.add("corrupted-round-shift")')&&ts.includes('app.classList.remove("corrupted-round-shift")')],
  ['audio driver is isolated TypeScript plus three WASM units',fs.existsSync(path.join(audioRoot,'control.ts'))&&audioUnits.every(name=>fs.existsSync(path.join(audioRoot,name,`${name}.ts`))&&fs.existsSync(path.join(audioRoot,name,`${name}.wasm`))&&WebAssembly.validate(fs.readFileSync(path.join(audioRoot,name,`${name}.wasm`)))&&fs.existsSync(path.join(root,'web','dist','audio-driver',name,`${name}.js`))&&fs.existsSync(path.join(root,'web','dist','audio-driver',name,`${name}.wasm`)))&&fs.existsSync(path.join(root,'web','dist','audio-driver','control.js'))&&audioControl.includes('hanafuda-audio-driver-command')&&audioControl.includes('AudioContext')&&!audioControl.includes('MutationObserver')&&!audioControl.includes('match-screen')&&!audioControl.includes('normal-bgm')&&!audioControl.includes('impossible-bgm')&&html.includes('type="module" src="./dist/audio-driver/control.js"')&&!html.includes('audio-engine-v1.js')],
  ['turn-flow override preserves CPU match-start audio command',turnFlowSrc.includes('emitAudioHook("match-start",{mode:settings.mode})')&&turnFlowSrc.includes('catch(e){emitAudioHook("match-stop")')],
  ['audio driver unlocks Web Audio inside a trusted gesture',audioControl.includes('function primeAudioContext(ctx:AudioContext)')&&audioControl.includes('ctx.createBuffer(1,1,ctx.sampleRate)')&&audioControl.includes("document.addEventListener('touchstart',activateFromGesture")&&audioControl.includes('runGestureProfileHook')],
  ['runtime patches are TypeScript-backed generated output',['pregame-gate-v3','turn-flow-v2','supabase-runtime-assets-v1','supabase-effect-source-v1','final-result-fix-v1','round-end-boundary-v1','initial-animation-performance-v1'].every(name=>fs.existsSync(path.join(root,'web','src',`${name}.ts`))&&fs.existsSync(path.join(root,'web','dist',`${name}.js`)))],
  ['CPU requests go through Cloudflare gateway',ts.includes('/api/mode/start')&&ts.includes('/api/cpu/start')&&!ts.includes('supabase.co/functions/v1/hanafuda-engine')],
  ['online room inspect happens before join UI enables',ts.includes('/api/online/inspect?room=')&&ts.includes('join.disabled=false')],
  ['random matchmaking is websocket event-driven',ts.includes('/api/online/random/connect')&&ts.includes('new WebSocket(url)')&&ts.includes('msg?.type!=="matched"')&&!ts.includes('for(let i=0;i<24&&!r.data.matched')&&!ts.includes('/api/online/random",{ticket')],
  ['random matchmaking can be cancelled without polling',ts.includes('function cancelRandomMatch')&&ts.includes('type:"cancel"')&&ts.includes('マッチング中止')],
  ['online actions carry epoch and version',ts.includes('epoch:session.epoch,version:session.version')],
  ['online warning is actually wired to the warning event',ts.includes('msg?.type==="turn_warning"')&&ts.includes('startOnlineWarning();toast("持ち時間60秒を超えました。あと30秒です。")')],
  ['online websocket handles disconnect timeout and close separately',ts.includes('msg?.type==="disconnect"')&&ts.includes('msg?.type==="timeout"')&&ts.includes('msg?.type==="closed"')],
  ['no mid-match state persisted',!ts.includes('localStorage.setItem("session')&&!ts.includes('localStorage.setItem("snapshot')],
  ['page exit attempts authoritative cleanup',ts.includes('pagehide')&&ts.includes('/api/cpu/close')&&ts.includes('/api/online/close')],
  ['compiled javascript exists and parses',js.length>1000],
];
for(const [name,ok] of checks)console.log(ok?'PASS':'FAIL',name);
if(checks.some(([,ok])=>!ok))process.exit(1);
