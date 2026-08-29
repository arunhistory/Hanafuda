import fs from 'node:fs';
import assert from 'node:assert/strict';

const css=fs.readFileSync('web/mobile-landscape-v2.css','utf8');
const ts=fs.readFileSync('web/src/ui-profile.ts','utf8');
const html=fs.readFileSync('web/index.html','utf8');

assert.match(html,/mobile-landscape-v2\.css/,'mobile landscape stylesheet must be loaded');
assert.match(html,/dist\/ui-profile\.js/,'Supabase-directed UI controller must be loaded');
assert.doesNotMatch(html,/orientation\.css|dist\/orientation\.js/,'obsolete local orientation assets must not be loaded');
assert.match(html,/https:\/\/mpuhgfbdkxmhynytwhzu\.supabase\.co/,'CSP must allow the Supabase UI authority');
assert.match(ts,/hanafuda-ui-profile/,'frontend must ask Supabase for the UI profile');
assert.match(ts,/data\?\.profile==="desktop"\|\|data\?\.profile==="mobile_landscape"/,'frontend may only accept the two server-approved profiles');
assert.doesNotMatch(ts,/function isPhoneOrTablet\(\)/,'frontend must not independently decide phone/tablet classification');
assert.doesNotMatch(ts,/Android\|iPhone\|iPad\|iPod\|Mobile\|Tablet/,'device classification rules must not live in GitHub frontend');
assert.match(ts,/activeProfile!=="mobile_landscape"/,'orientation behavior must only activate after the server profile says mobile landscape');
assert.match(ts,/orientation\.lock\("landscape"\)/,'supported browsers must request native landscape after server approval');
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
