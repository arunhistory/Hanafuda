import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const ts=fs.readFileSync(path.join(root,'web','src','final-result-fix-v1.ts'),'utf8');
const css=fs.readFileSync(path.join(root,'web','final-result-fix-v1.css'),'utf8');

const checks=[
  ['forced challenge marker is required',ts.includes('hiddenFirstEncounter===true')],
  ['clear screen is CPU impossible only',ts.includes('session?.kind==="cpu"')&&ts.includes('session.mode==="impossible"')],
  ['clear screen is fixed to six-round challenge',ts.includes('s.totalRounds===6')],
  ['player must be final match winner',ts.includes('s.matchWinner===playerSeat()')],
  ['phase six branches to special clear before ordinary result',ts.includes('if(isImpossibleSpecialVictory(snapshot))return renderImpossibleClear();')&&ts.includes('return renderDedicatedFinalResult();')],
  ['rainbow background is Supabase hosted',ts.includes('hanafuda-assets/impossible-clear/')&&ts.includes('rainbow-clear-bg.png')],
  ['congratulation image is Supabase hosted',ts.includes('congratulation.png')],
  ['thank-you image is Supabase hosted',ts.includes('thank-you-for-praying.png')],
  ['special clear does not render ordinary score settlement UI',!ts.slice(ts.indexOf('function renderImpossibleClear()'),ts.indexOf('function renderDedicatedFinalResult()')).includes('final-result-score')],
  ['title reveal starts clipped from the right',css.includes('clip-path:inset(0 100% 0 0)')],
  ['reveal completes left to right',css.includes('clip-path:inset(0 0 0 0)')],
  ['second line is staggered after the title',css.includes('.impossible-clear-thanks{')&&css.includes('animation-delay:.72s')],
  ['special screen has dedicated rainbow background variable',css.includes('var(--impossible-clear-bg) center/cover no-repeat')],
  ['ordinary final result styles remain present',css.includes('.app-shell.final-result-mode')&&css.includes('.final-result-score')],
];
for(const [name,ok] of checks)console.log(ok?'PASS':'FAIL',name);
if(checks.some(([,ok])=>!ok))process.exit(1);
