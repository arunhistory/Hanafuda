import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const audio=read('web/src/settings-audio-v1.ts');
const recovery=read('web/src/regression-recovery-v1.ts');
const online=read('web/src/online.ts');
const css=read('web/ui-usability-v1.css');
const html=read('web/index.html');

const checks=[
  ['BGM and SE mute state is persisted',audio.includes('bgmMuted:boolean')&&audio.includes('seMuted:boolean')&&audio.includes("data-audio-mute=\"${channel}\"")],
  ['mute applies zero master volume without losing slider volume',audio.includes('channelMuted(channel)?0:channelVolume(channel)')&&audio.includes('saveAudioUserSettings()')],
  ['dealer choices restore random player and opponent',recovery.includes("regressionDealerButton(-1,'ランダム')")&&recovery.includes("regressionDealerButton(0,'あなたが親')")&&recovery.includes("regressionDealerButton(1,'相手が親')")],
  ['selected dealer is sent to CPU start',recovery.includes('firstDealer:settings.firstDealer')&&recovery.includes('/api/cpu/start')],
  ['online recovery is event driven and not polling',recovery.includes("addEventListener('error'")&&recovery.includes("addEventListener('close'")&&recovery.includes('/api/online/status')&&!recovery.includes('setInterval(')],
  ['created room code is persistent rather than toast-only',online.includes('function waitingRoomHtml')&&online.includes('room-code-value')&&online.includes('相手が参加するまで、この画面にルームコードと招待リンクを表示し続けます。')&&!online.includes('toast(`ルームコード:')],
  ['invite URL contains only public room code',online.includes('url.search="";url.hash="";url.searchParams.set("room",code)')&&online.includes('function inviteUrlForRoom')],
  ['invite link has persistent display and copy control',online.includes('id="invite-url"')&&online.includes('data-action="copy-invite"')&&online.includes('navigator.clipboard?.writeText')&&online.includes('document.execCommand("copy")')],
  ['invite URL performs inspect then existing join flow',online.includes('function joinInvitedOnlineRoom')&&online.includes('/api/online/inspect?room=')&&online.includes('api("/api/online/join",{roomCode:code})')&&online.includes('clearInvitedRoomFromUrl()')],
  ['persistent room and invite controls are prominent on mobile',css.includes('.room-code-panel')&&css.includes('.room-code-value')&&css.includes('.invite-link-panel')&&css.includes('html.mobile-webapp .invite-link-controls')],
  ['mobile copyright is visible',html.includes('©ある〜ん')&&css.includes('html.mobile-webapp .copyright')&&css.includes('display:block;')],
  ['mobile settings controls are expanded',css.includes('html.mobile-webapp .settings-screen-expanded .panel')&&css.includes('min-height:52px')&&css.includes('grid-template-columns:repeat(3,minmax(130px,1fr))')],
  ['mobile CPU setup controls are expanded',css.includes('html.mobile-webapp .cpu-setup-expanded .cpu-setup-panel')&&css.includes('grid-template-columns:repeat(6,minmax(0,1fr))')&&css.includes('min-height:46px')],
  ['new usability assets are loaded',html.includes('./ui-usability-v1.css')&&html.includes('./dist/regression-recovery-v1.js')]
];

for(const [name,ok] of checks)console.log(ok?'PASS':'FAIL',name);
if(checks.some(([,ok])=>!ok))process.exit(1);
