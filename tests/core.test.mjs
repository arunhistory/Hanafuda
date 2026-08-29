import fs from 'node:fs';

const bytes=fs.readFileSync(new URL('../assets/wasm/hanafuda_core.wasm',import.meta.url));
const {instance}=await WebAssembly.instantiate(bytes,{});
const e=instance.exports;
const mem=new Uint8Array(e.memory.buffer);
const p=e.get_buffer();
const put=a=>(mem.set(a,p),p);
const score=a=>e.score_captured(put(a),a.length);
const tests=[];
const t=(name,got,expected)=>tests.push({name,got,expected,ok:got===expected});

t('Goko',score([1,9,29,43,45]),100);
t('Shiko',score([1,9,29,45]),90);
t('Ameshiko',score([1,9,29,43]),70);
t('Sanko',score([1,9,29]),40);
t('Inoshikacho',score([24,37,21]),60);
t('Akatan',score([2,6,10]),50);
t('Aotan',score([22,34,38]),50);
t('Hanami',score([9,33]),40);
t('Tsukimi',score([29,33]),40);
t('Tan+Akatan',score([2,6,10,14,18]),80);
t('Tane5',score([7,12,19,21,24]),10);
t('Tane6',score([7,12,19,21,24,30]),15);
t('Kasu5',score([0,3,4,5,8]),10);
t('Sake cup counts as Kasu',score([0,3,4,5,33]),10);
t('Teyon',e.special_hand(put([0,1,2,3,4,5,8,9]),8),1);
t('Kuttsuki',e.special_hand(put([0,1,4,5,8,9,12,13]),8),2);
t('December month',e.card_month(47),12);
t('Three matching field cards',e.matching_field_mask(0,put([1,2,3,4]),4),7);
t('Public CPU ABI has no hidden-deck argument',e.choose_hand_index.length,10);
t('CPU core version',e.core_version(),3);

function ptrAt(offset,values){mem.set(values,p+offset);return p+offset;}
function chooseHand(hand,field,own,opp,difficulty,seed=123){
  const hp=ptrAt(0,hand),fp=ptrAt(32,field),op=ptrAt(64,own),xp=ptrAt(128,opp);
  return e.choose_hand_index(hp,hand.length,fp,field.length,op,own.length,xp,opp.length,difficulty,seed);
}
function chooseCapture(field,matches,own,opp,difficulty,played,seed=123){
  const fp=ptrAt(0,field),mp=ptrAt(32,matches),op=ptrAt(64,own),xp=ptrAt(128,opp);
  return e.choose_capture_index(fp,field.length,mp,matches.length,op,own.length,xp,opp.length,difficulty,played,seed);
}

// Both moves capture immediately. With no yaku context Pro takes the valuable light;
// with public captured-card context it recognizes the boar completing Inoshikacho.
t('Pro prefers raw light without yaku context',chooseHand([24,0],[25,1],[],[],2,17),1);
t('Pro changes choice to complete Inoshikacho from public captures',chooseHand([24,0],[25,1],[21,37],[],2,17),0);

// A two-match choice must also use public yaku progress instead of blindly taking the first field card.
t('Pro capture takes raw light without yaku context',chooseCapture([9,10],[0,1],[],[],2,8,9),0);
t('Pro capture completes Akatan from public captures',chooseCapture([9,10],[0,1],[2,6],[],2,8,9),1);

for(const x of tests)console.log(x.ok?'PASS':'FAIL',x.name,x.got,x.expected);
if(tests.some(x=>!x.ok))process.exit(1);
