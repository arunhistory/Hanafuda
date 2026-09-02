type AudioUserSettings={bgmVolume:number;seVolume:number;bgmMuted:boolean;seMuted:boolean};

const AUDIO_SETTINGS_KEY='hanafuda.audio-settings.v1';

function clampUserVolume(value:unknown){
  const n=Number(value);
  if(!Number.isFinite(n))return 1;
  return Math.min(1,Math.max(0,Math.round(n*100)/100));
}

function loadAudioUserSettings():AudioUserSettings{
  const fallback:AudioUserSettings={bgmVolume:1,seVolume:1,bgmMuted:false,seMuted:false};
  try{
    const raw=localStorage.getItem(AUDIO_SETTINGS_KEY);
    if(!raw)return fallback;
    const value=JSON.parse(raw) as Partial<AudioUserSettings>;
    return {
      bgmVolume:clampUserVolume(value.bgmVolume),
      seVolume:clampUserVolume(value.seVolume),
      bgmMuted:value.bgmMuted===true,
      seMuted:value.seMuted===true
    };
  }catch{return fallback;}
}

let audioUserSettings=loadAudioUserSettings();

function saveAudioUserSettings(){
  try{localStorage.setItem(AUDIO_SETTINGS_KEY,JSON.stringify(audioUserSettings));}catch{}
}

function channelMuted(channel:'bgm'|'se'){
  return channel==='bgm'?audioUserSettings.bgmMuted:audioUserSettings.seMuted;
}
function channelVolume(channel:'bgm'|'se'){
  return channel==='bgm'?audioUserSettings.bgmVolume:audioUserSettings.seVolume;
}
function applyAudioUserVolume(channel:'bgm'|'se'){
  const driver=window.hanafudaAudioDriver;
  if(!driver)return;
  void driver.execute({type:'set-volume',channel,volume:channelMuted(channel)?0:channelVolume(channel)});
}

function applyAllAudioUserVolumes(){
  applyAudioUserVolume('bgm');
  applyAudioUserVolume('se');
}

function audioVolumeRow(channel:'bgm'|'se',label:string,volume:number){
  const percent=Math.round(volume*100),muted=channelMuted(channel);
  return `<label for="${channel}-volume">${label}</label><div class="audio-control-row"><input id="${channel}-volume" data-audio-volume="${channel}" type="range" min="0" max="100" step="1" value="${percent}" aria-label="${label}音量"><output id="${channel}-volume-value" for="${channel}-volume">${percent}%</output><button type="button" class="audio-mute-button ${muted?'selected':''}" data-audio-mute="${channel}" aria-pressed="${muted}" aria-label="${label}ミュート">ミュート</button></div>`;
}

function patchAudioSettingsUi(){
  if(currentScreen()!=='settings')return;
  const main=app.querySelector<HTMLElement>('main');
  const grid=main?.querySelector<HTMLElement>('.settings-grid');
  if(!main||!grid)return;
  main.classList.add('settings-screen-expanded');

  main.querySelector<HTMLElement>('[data-nav="rules"]')?.remove();
  if(grid.querySelector('[data-audio-volume]'))return;

  const labels=[...grid.querySelectorAll<HTMLLabelElement>('label')];
  const audioLabel=labels.find(label=>label.textContent?.trim()==='音響');
  const audioNotice=audioLabel?.nextElementSibling;
  if(audioNotice?.classList.contains('notice'))audioNotice.remove();
  audioLabel?.remove();

  grid.insertAdjacentHTML('beforeend',audioVolumeRow('bgm','BGM',audioUserSettings.bgmVolume)+audioVolumeRow('se','SE',audioUserSettings.seVolume));
}

const settingsUiObserver=new MutationObserver(()=>patchAudioSettingsUi());
settingsUiObserver.observe(app,{childList:true,subtree:true});
patchAudioSettingsUi();

document.addEventListener('input',event=>{
  const input=event.target instanceof HTMLInputElement?event.target:null;
  const channel=input?.dataset.audioVolume;
  if(!input||!input.closest('#app')||(channel!=='bgm'&&channel!=='se'))return;
  const volume=clampUserVolume(Number(input.value)/100);
  if(channel==='bgm')audioUserSettings.bgmVolume=volume;
  else audioUserSettings.seVolume=volume;
  const output=document.querySelector<HTMLOutputElement>(`#${channel}-volume-value`);
  if(output)output.value=`${Math.round(volume*100)}%`;
  saveAudioUserSettings();
  applyAudioUserVolume(channel);
});

document.addEventListener('click',event=>{
  const target=event.target instanceof Element?event.target.closest<HTMLButtonElement>('[data-audio-mute]'):null;
  const channel=target?.dataset.audioMute;
  if(!target||!target.closest('#app')||(channel!=='bgm'&&channel!=='se'))return;
  if(channel==='bgm')audioUserSettings.bgmMuted=!audioUserSettings.bgmMuted;
  else audioUserSettings.seMuted=!audioUserSettings.seMuted;
  const muted=channelMuted(channel);
  target.classList.toggle('selected',muted);
  target.setAttribute('aria-pressed',String(muted));
  saveAudioUserSettings();
  applyAudioUserVolume(channel);
},true);

window.addEventListener('hanafuda-audio-driver-ready',applyAllAudioUserVolumes);
if(window.hanafudaAudioDriver)applyAllAudioUserVolumes();