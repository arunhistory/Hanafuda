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

for(const x of tests)console.log(x.ok?'PASS':'FAIL',x.name,x.got,x.expected);
if(tests.some(x=>!x.ok))process.exit(1);
