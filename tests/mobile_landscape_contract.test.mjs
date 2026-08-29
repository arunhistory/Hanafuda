import fs from 'node:fs';
import assert from 'node:assert/strict';

const css=fs.readFileSync('web/mobile-landscape-v3.css','utf8');
const ts=fs.readFileSync('web/src/mobile-launch.ts','utf8');
const html=fs.readFileSync('web/index.html','utf8');

assert.match(html,/id="webapp-viewport" class="webapp-viewport"/,'the web app must have one rotatable viewport wrapper');
assert.match(html,/mobile-landscape-v3\.css/,'the virtual landscape stylesheet must be loaded');
assert.match(html,/dist\/mobile-launch\.js/,'the mobile web-app launcher must be loaded');
assert.doesNotMatch(html,/dist\/ui-profile\.js|mobile-landscape-v2\.css/,'obsolete server-driven orientation assets must not be loaded');
assert.doesNotMatch(html,/mpuhgfbdkxmhynytwhzu\.supabase\.co/,'orientation launch must not depend on Supabase');

assert.match(ts,/function isMobileOrTablet\(\)/,'mobile/tablet launch detection must exist in the web app');
assert.match(ts,/window\.visualViewport/,'the canvas must use the actual browser content viewport');
assert.match(ts,/canvasWidth=portrait\?height:width/,'portrait browsers must expose their long dimension as landscape width');
assert.match(ts,/canvasHeight=portrait\?width:height/,'portrait browsers must expose their short dimension as landscape height');
assert.match(ts,/virtual-landscape/,'portrait mobile browsers must activate the virtual landscape shell');
assert.match(ts,/compact-landscape/,'short phone canvases must have an explicit readable layout mode');
assert.doesNotMatch(ts,/orientation\.lock|requestFullscreen|hanafuda-ui-profile/,'launch must not rotate the OS, force fullscreen, or call a UI orientation service');

assert.match(css,/html\.mobile-webapp\.virtual-landscape \.webapp-viewport[^\n]*rotate\(90deg\)/,'only the completed landscape viewport may be rotated into a portrait browser');
assert.doesNotMatch(css,/\.app-shell[^\n]*rotate\(|\.screen[^\n]*rotate\(|\.board[^\n]*rotate\(/,'internal game UI must not be a rotated portrait layout');
assert.match(css,/--mobile-canvas-height/,'mobile sizing must use the virtual landscape canvas height');
assert.match(css,/grid-template-columns:minmax\(122px,18%\) minmax\(0,64%\) minmax\(122px,18%\)/,'match layout must reserve readable side rails and a dominant central field');
assert.match(css,/\.opponent-zone>\.hand-row[^\n]*grid-column:2;grid-row:1/,'opponent hand must be above the field');
assert.match(css,/\.player-zone>\.hand-row[^\n]*grid-column:2;grid-row:3/,'player hand must be below the field');
assert.match(css,/\.opponent-zone>\.captured-box[^\n]*grid-column:3/,'opponent captures must use the right rail');
assert.match(css,/\.player-zone>\.captured-box[^\n]*grid-column:1/,'player captures must use the left rail');
assert.match(css,/\.koi-choice button\{min-height:56px/,'koi/agari choices must remain large enough to tap');
assert.match(css,/html\.mobile-webapp\.compact-landscape/,'short phone browser layouts must preserve playability');

console.log('mobile virtual landscape contract: PASS');
