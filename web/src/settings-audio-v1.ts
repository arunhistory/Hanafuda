type AudioUserSettings={bgmVolume:number;seVolume:number};

const AUDIO_SETTINGS_KEY='hanafuda.audio-settings.v1';

function clampUserVolume(value:unknown){
  const n=Number(value);
  if(!Number.isFinite(n))return 1;
  return Math.min(1,Math.max(0,Math.round(n*100)/100));
}

function loadAudioUserSettings():AudioUserSettings{
  const fallback:AudioUserSettings={bgmVolume:1,seVolume:1};
  try{
    const raw=localStorage.getItem(AUDIO_SETTINGS_KEY);
    if(!raw)return fallback;
    const value=JSON.parse(raw) as Partial<AudioUserSettings>;
    return {
      bgmVolume:clampUserVolume(value.bgmVolume),
      seVolume:clampUserVolume(value.seVolume)
    };
  }catch{return fallback;}
}

let audioUserSettings=loadAudioUserSettings();

function saveAudioUserSettings(){
  try{localStorage.setItem(AUDIO_SETTINGS_KEY,JSON.stringify(audioUserSettings));}catch{}
}

function applyAudioUserVolume(channel:'bgm'|'se',volume:number){
  const driver=window.hanafudaAudioDriver;
  if(!driver)return;
  void driver.execute({type:'set-volume',channel,volume});
}

function applyAllAudioUserVolumes(){
  applyAudioUserVolume('bgm',audioUserSettings.bgmVolume);
  applyAudioUserVolume('se',audioUserSettings.seVolume);
}

function audioVolumeRow(channel:'bgm'|'se',label:string,volume:number){
  const percent=Math.round(volume*100);
  return `<label for="${channel}-volume">${label}</label><div class="check-row" style="gap:10px"><input id="${channel}-volume" data-audio-volume="${channel}" type="range" min="0" max="100" step="1" value="${percent}" aria-label="${label}音量" style="flex:1;min-width:0"><output id="${channel}-volume-value" for="${channel}-volume" style="min-width:4ch;text-align:right">${percent}%</output></div>`;
}

renderSettingsScreen=()=>{
  app.innerHTML=`<main class="${screenClass()}">${topbar('設定')}<section class="panel"><div class="settings-grid"><label for="skip-animations">通常演出</label><div class="check-row"><input id="skip-animations" type="checkbox" ${settings.skipNormalAnimations?'checked':''}><span>通常演出をスキップ</span></div>${audioVolumeRow('bgm','BGM',audioUserSettings.bgmVolume)}${audioVolumeRow('se','SE',audioUserSettings.seVolume)}</div><div class="screen-actions"><button class="secondary" data-nav="terms">利用規約</button><button class="secondary" data-nav="credits">クレジット</button><button class="secondary" data-nav="licenses">ライセンス</button></div></section></main>`;
};

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
  applyAudioUserVolume(channel,volume);
});

window.addEventListener('hanafuda-audio-driver-ready',applyAllAudioUserVolumes);
if(window.hanafudaAudioDriver)applyAllAudioUserVolumes();