const API_BASE = "https://hanafuda-system.garigarimegane625.workers.dev";
const SETTINGS_KEY = "hanafuda.settings.v1";
const UNLOCK_KEY = "hanafuda.impossible.unlocked.v1";

type CpuMode = "beginner" | "amateur" | "pro" | "impossible";
type UiScreen = "home" | "cpu-setup" | "online" | "settings" | "rules" | "yaku" | "match";
type Seat = 0 | 1;

type Settings = {
  mode: CpuMode;
  rounds: number;
  koiEnabled: boolean;
  skipNormalAnimations: boolean;
};

type Snapshot = {
  phase: number;
  status: number;
  turn: number;
  dealer: number;
  roundIndex: number;
  totalRounds: number;
  scores: [number, number];
  hand: number[];
  opponentHandCount: number;
  field: number[];
  captured: [number[], number[]];
  yakuMasks: [number, number];
  pendingMatches: number[];
  offeredScore: number;
  koiUsed: boolean;
  koiEnabled: boolean;
  lastRoundWinner: number;
  lastRoundPoints: number;
  special: [number, number];
  matchWinner: number;
  deckRemaining: number;
};

type ActionEvent = {
  type?: string;
  actor?: number;
  roundIndex?: number;
  playedCard?: number | null;
  drawnCard?: number | null;
  capturedCards?: number[];
  newYakuMask?: number;
  yakuMasks?: [number, number];
  settlement?: {winner:number;points:number;scores:[number,number]} | null;
  fieldIndex?: number;
  chooseKoi?: boolean;
  nextRoundIndex?: number;
};

type ApiEvent = {actor:string;snapshot:Snapshot;version:number;actionEvent:ActionEvent|null};
type CpuSession = {
  kind:"cpu";
  sessionId:string;
  token:string;
  version:number;
  mode:CpuMode;
  rounds:number;
  koiEnabled:boolean;
  modeSessionId?:string;
  modeSessionToken?:string;
};
type OnlineSession = {
  kind:"online";
  roomCode:string;
  token:string;
  seat:Seat;
  version:number;
  epoch:string;
  rules:{rounds:number;koiEnabled:boolean};
  socket:WebSocket|null;
};
type MatchSession = CpuSession | OnlineSession;

type AssetRegistry = {version:number;assets:Record<string,{path?:string;pattern?:string}>};

const YAKU: Array<[number,string,string]> = [
  [1<<0,"五光","100点"],[1<<1,"四光","90点"],[1<<2,"雨入り四光","70点"],[1<<3,"三光","40点"],
  [1<<4,"猪鹿蝶","60点"],[1<<5,"赤タン","50点"],[1<<6,"青タン","50点"],[1<<7,"花見で一杯","40点"],
  [1<<8,"月見で一杯","40点"],[1<<9,"タン","30点"],[1<<10,"タネ","5枚10点・以後1枚+5点"],[1<<11,"カス","5枚10点・以後1枚+5点"]
];

const YAKU_DETAILS = [
  ["五光","100点","光5枚"],["四光","90点","雨札を含まない光4枚"],["雨入り四光","70点","雨札を含む光4枚"],["三光","40点","雨札を含まない光3枚"],
  ["猪鹿蝶","60点","猪・鹿・蝶"],["赤タン","50点","1〜3月の文字入り赤短3枚"],["青タン","50点","6・9・10月の青短3枚"],
  ["花見で一杯","40点","桜に幕 + 菊に盃"],["月見で一杯","40点","芒に月 + 菊に盃"],["タン","30点","短冊5枚"],
  ["タネ","5枚10点・以後+5点","タネ札5枚以上"],["カス","5枚10点・以後+5点","カス役対象札5枚以上。菊に盃を加算可"],
  ["手四","60点","配札時、同月4枚"],["くっつき","60点","配札時、同月2枚組×4"]
];

class Assets {
  private registry: AssetRegistry | null = null;
  async load(){
    if(this.registry)return;
    const response=await fetch("../assets/config/asset-registry.json",{cache:"no-store"});
    if(!response.ok)throw new Error("ASSET_REGISTRY_LOAD_FAILED");
    this.registry=await response.json() as AssetRegistry;
    const root=document.documentElement.style;
    root.setProperty("--asset-bg-normal",`url("${this.path("background.match.normal")}")`);
    root.setProperty("--asset-bg-corrupted",`url("${this.path("background.match.corrupted")}")`);
    root.setProperty("--asset-callout-bg",`url("${this.path("effect.callout.background")}")`);
    root.setProperty("--asset-bg-settlement",`url("${this.path("background.settlement")}")`);
    root.setProperty("--asset-card-back",`url("${this.path("cards.back")}")`);
  }
  path(id:string){
    const item=this.registry?.assets[id];
    if(!item?.path)throw new Error(`ASSET_NOT_FOUND:${id}`);
    return `../${item.path}`;
  }
  card(card:number){
    const item=this.registry?.assets["cards.generated"];
    if(!item?.pattern)throw new Error("CARD_PATTERN_NOT_FOUND");
    const month=Math.floor(card/4)+1, col=card%4+1;
    const id=`m${String(month).padStart(2,"0")}-c${col}`;
    return `../${item.pattern.replace("{id}",id)}`;
  }
}

const assets=new Assets();
const app=document.querySelector<HTMLElement>("#app")!;
let settings=loadSettings();
let stack:UiScreen[]=["home"];
let session:MatchSession|null=null;
let snapshot:Snapshot|null=null;
let currentRound=-1;
let roundHistory:string[]=[];
let busy=false;
let matchInteractionReady=true;
let modal:"pause"|"yaku"|"state"|"history"|"rules"|"settings"|"giveup"|null=null;
let pendingModeTransition=false;
let hiddenFirstEncounter=false;
let onlineReconfigureState:"none"|"host"|"guest"="none";
let queuedToasts:string[]=[];

function loadSettings():Settings{
  const fallback:Settings={mode:"beginner",rounds:12,koiEnabled:true,skipNormalAnimations:false};
  try{
    const raw=localStorage.getItem(SETTINGS_KEY);if(!raw)return fallback;
    const value=JSON.parse(raw);
    const mode:[CpuMode,...CpuMode[]]=["beginner","amateur","pro","impossible"];
    const chosen=mode.includes(value?.mode)?value.mode:fallback.mode;
    const rounds=Number(value?.rounds);
    return {mode:chosen,rounds:Number.isInteger(rounds)&&rounds>=1&&rounds<=12?rounds:12,koiEnabled:value?.koiEnabled!==false,skipNormalAnimations:value?.skipNormalAnimations===true};
  }catch{return fallback;}
}
function saveSettings(){localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));}
function isUnlocked(){return localStorage.getItem(UNLOCK_KEY)==="1";}
function grantUnlock(){localStorage.setItem(UNLOCK_KEY,"1");}
function currentScreen(){return stack[stack.length-1];}
function push(screen:UiScreen){stack.push(screen);render();}
function back(){if(stack.length>1)stack.pop();render();}
function goHome(){stack=["home"];modal=null;render();}
function escapeHtml(value:unknown){return String(value).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]!));}
function modeLabel(mode:CpuMode){return mode==="beginner"?"初心者":mode==="amateur"?"アマチュア":mode==="pro"?"プロ":"人知不能";}
function phaseLabel(s:Snapshot){
  if(session?.kind==="cpu"&&!matchInteractionReady)return "対局準備中";
  if(s.phase===1)return s.turn===playerSeat()?"手札から1枚選んでください":"相手の手番です";
  if(s.phase===2||s.phase===3)return s.turn===playerSeat()?"取る場札を選んでください":"相手が取得札を選択中";
  if(s.phase===4)return s.turn===playerSeat()?"役が成立しました":"相手がこいこいを判断中";
  if(s.phase===5)return "局の精算";
  if(s.phase===6)return "対局終了";
  return "対局中";
}
function playerSeat():Seat{return session?.kind==="online"?session.seat:0;}
function opponentSeat():Seat{return (1-playerSeat()) as Seat;}
function perspectiveScores(s:Snapshot):[number,number]{const p=playerSeat();return [s.scores[p],s.scores[1-p] as number];}
function perspectiveCaptured(s:Snapshot):[number[],number[]]{const p=playerSeat();return [s.captured[p],s.captured[1-p]];}
function emitAudioHook(name:string,detail:unknown={}){window.dispatchEvent(new CustomEvent("hanafuda-audio-hook",{detail:{name,...(detail as object)}}));}
function toast(message:string){queuedToasts.push(message);renderToasts();setTimeout(()=>{queuedToasts.shift();renderToasts();},2450);}
function renderToasts(){let el=document.querySelector<HTMLElement>("#toast-stack");if(!el){el=document.createElement("div");el.id="toast-stack";el.className="toast-stack";document.body.append(el);}el.innerHTML=queuedToasts.map(x=>`<div class="toast">${escapeHtml(x)}</div>`).join("");}

function topbar(title:string,backEnabled=true){return `<header class="topbar">${backEnabled?'<button class="icon-button" data-action="back" aria-label="戻る">←</button>':'<span></span>'}<h1>${escapeHtml(title)}</h1><button class="icon-button" data-action="home" aria-label="ホーム">⌂</button></header>`;}
function screenClass(extra=""){return `screen ${extra}`.trim();}
