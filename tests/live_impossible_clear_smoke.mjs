import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  await page.goto(`https://arunhistory.github.io/Hanafuda/web/?clear-smoke=${Date.now()}`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.__hanafudaFinalResultFixVersion==='5');

  const setFinal=async winner=>page.evaluate(winner=>{
    window.eval(`hiddenFirstEncounter=true;session={kind:"cpu",sessionId:"smoke",token:"smoke",version:0,mode:"impossible",rounds:6,koiEnabled:true};snapshot={phase:6,status:0,turn:0,dealer:0,roundIndex:5,totalRounds:6,scores:[640,120],hand:[],opponentHandCount:0,field:[],captured:[[],[]],yakuMasks:[0,0],pendingMatches:[],offeredScore:0,koiUsed:false,koiEnabled:true,lastRoundWinner:0,lastRoundPoints:120,special:[0,0],matchWinner:${winner},deckRemaining:0};renderMatch();`);
  },winner);

  await setFinal(0);
  await page.waitForSelector('.impossible-clear-screen');
  if(await page.locator('.final-result-screen').count())throw new Error('ordinary final result leaked into special victory');
  const visual=await page.evaluate(()=>{
    const screen=document.querySelector('.impossible-clear-screen');
    const title=document.querySelector('.impossible-clear-title');
    const thanks=document.querySelector('.impossible-clear-thanks');
    const images=[title,thanks];
    return {
      background:getComputedStyle(screen).backgroundImage,
      titleAnimation:getComputedStyle(title).animationName,
      thanksAnimation:getComputedStyle(thanks).animationName,
      images:images.map(img=>({complete:img.complete,naturalWidth:img.naturalWidth,src:img.currentSrc||img.src}))
    };
  });
  if(!visual.background.includes('rainbow-clear-bg.png'))throw new Error('rainbow background not applied');
  if(visual.titleAnimation!=='impossible-clear-reveal'||visual.thanksAnimation!=='impossible-clear-reveal')throw new Error('reveal animation not applied');
  if(visual.images.some(x=>!x.complete||x.naturalWidth<=0))throw new Error('clear text image failed to load');
  if(!visual.images[0].src.includes('congratulation.png'))throw new Error('wrong title asset');
  if(!visual.images[1].src.includes('thank-you-for-praying.png'))throw new Error('wrong thanks asset');

  await setFinal(1);
  await page.waitForSelector('.final-result-screen');
  if(await page.locator('.impossible-clear-screen').count())throw new Error('special clear leaked into loss result');
  console.log('LIVE IMPOSSIBLE CLEAR SMOKE: PASS');
} finally {
  await browser.close();
}
