import fs from 'node:fs';
import assert from 'node:assert/strict';

const css=fs.readFileSync('web/orientation.css','utf8');
const ts=fs.readFileSync('web/src/orientation.ts','utf8');
const html=fs.readFileSync('web/index.html','utf8');

assert.match(html,/orientation\.css/,'orientation stylesheet must be loaded');
assert.match(html,/dist\/orientation\.js/,'orientation controller must be loaded');
assert.match(ts,/function isPhoneOrTablet\(\)/,'phone/tablet detection must exist');
assert.match(ts,/touch-landscape-device/,'mobile/tablet class must be isolated from desktop');
assert.match(ts,/portrait-device/,'portrait state must be explicit');
assert.match(ts,/orientation\.lock\("landscape"\)/,'supported browsers must request native landscape');
assert.match(ts,/requestFullscreenForOrientation/,'gesture path must support browsers that require fullscreen before lock');
assert.doesNotMatch(css,/portrait-landscape-fallback/,'old rotated portrait fallback must be removed');
assert.doesNotMatch(css,/transform\s*:\s*rotate\(-?90deg\)/,'the game UI must never be rotated as a fake landscape viewport');
assert.match(css,/html\.touch-landscape-device \.hero/,'home landscape layout must be mobile/tablet scoped');
assert.match(css,/html\.touch-landscape-device \.settings-grid/,'settings landscape layout must be mobile/tablet scoped');
assert.match(css,/html\.touch-landscape-device \.board/,'match table landscape layout must be mobile/tablet scoped');
assert.match(css,/\.opponent-zone>\.captured-box/,'opponent captures must move to a landscape side rail');
assert.match(css,/\.player-zone>\.captured-box/,'player captures must move to a landscape side rail');
assert.match(css,/\.opponent-zone>\.hand-row/,'opponent hand must remain above the field');
assert.match(css,/\.player-zone>\.hand-row/,'player hand must remain below the field');
assert.match(css,/\.orientation-gate/,'portrait fallback must ask for physical landscape instead of rotating UI');

console.log('mobile landscape contract: PASS');
