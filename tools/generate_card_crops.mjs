import fs from 'node:fs';
import path from 'node:path';

const boxes=[[80,80,99,211],[185,79,98,212],[289,80,100,211],[395,80,99,210],[531,80,90,211],[626,80,89,210],[721,80,90,210],[817,80,93,210],[952,80,97,203],[1056,80,99,203],[1163,80,98,203],[1268,80,99,203],[80,338,102,183],[188,338,96,183],[290,338,99,183],[395,338,99,183],[531,338,91,183],[626,338,90,183],[721,338,90,183],[817,338,93,183],[951,338,99,183],[1054,338,104,183],[1164,338,99,183],[1268,338,101,183],[80,564,102,180],[188,564,96,180],[290,564,99,180],[395,564,99,180],[531,564,91,180],[626,564,90,180],[721,564,91,180],[817,564,93,180],[951,564,99,180],[1055,564,103,180],[1164,564,99,180],[1269,564,100,180],[80,785,98,187],[184,785,100,187],[290,785,98,187],[394,785,100,187],[530,785,92,187],[628,785,88,187],[722,785,91,187],[818,785,92,187],[952,785,97,187],[1055,785,104,187],[1166,785,97,187],[1269,785,100,187]];
const types=[["kasu","light","ribbon","kasu"],["kasu","kasu","ribbon","tane"],["kasu","light","ribbon","kasu"],["tane","kasu","ribbon","kasu"],["kasu","kasu","ribbon","tane"],["kasu","tane","ribbon","kasu"],["tane","kasu","ribbon","kasu"],["kasu","light","tane","kasu"],["kasu","tane","ribbon","kasu"],["kasu","tane","ribbon","kasu"],["kasu","tane","ribbon","light"],["kasu","light","kasu","kasu"]];
if(boxes.length!==48)throw new Error('crop count must be 48');
const cards=[];
let i=0;
for(let month=1;month<=12;month++){
  for(let slot=1;slot<=4;slot++){
    const [x,y,width,height]=boxes[i++];
    const id=`m${String(month).padStart(2,'0')}-c${slot}`;
    cards.push({id,month,slot,logical_type:types[month-1][slot-1],crop:{x,y,width,height},output:`assets/cards/generated/${id}.png`});
  }
}
const manifest={version:1,source:'assets/cards/sheet/card-sheet.png',sourceWidth:1447,sourceHeight:1087,output:{width:240,height:480,fit:'contain',format:'png',lossless:true},cards};
const out=path.resolve('assets/config/card-crops.json');
fs.mkdirSync(path.dirname(out),{recursive:true});
fs.writeFileSync(out,JSON.stringify(manifest,null,2)+'\n');
console.log(`PASS wrote ${cards.length} crop definitions to ${out}`);
