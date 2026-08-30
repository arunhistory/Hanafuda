import fs from 'node:fs';
import assert from 'node:assert/strict';

const css=fs.readFileSync('web/mobile-landscape-v6.css','utf8');
const phoneCss=fs.readFileSync('web/mobile-phone-home-fix-v1.css','utf8');
const pacingCss=fs.readFileSync('web/match-pacing.css','utf8');
const ts=fs.readFileSync('web/src/mobile-launch.ts','utf8');
const html=fs.readFileSync('web/index.html','utf8');

assert.match(html,/id="webapp-viewport" class="webapp-viewport"/,'the web app must have one virtual landscape viewport wrapper');
assert.match(html,/mobile-landscape-v6\.css/,'the current mobile match stylesheet must be loaded');
assert.doesNotMatch(html,/mobile-landscape-v5\.css|mobile-landscape-v4\.css/,'superseded mobile stylesheets must not be loaded');
assert.match(html,/mobile-phone-home-fix-v1\.css/,'the phone-specific overflow correction must be loaded after the base mobile layout');
assert.match(html,/dist\/mobile-launch\.js/,'the mobile web-app launcher must be loaded');
assert.doesNotMatch(html,/mobile-landscape-v3\.css|dist\/ui-profile\.js|mobile-landscape-v2\.css/,'obsolete mobile layout assets must not be loaded');
assert.doesNotMatch(ts,/supabase\.co|hanafuda-ui-profile/,'mobile launch must not depend on a Supabase orientation service');

assert.match(ts,/function isMobileOrTablet\(\)/,'mobile/tablet launch detection must exist in the web app');
assert.match(ts,/function isChromeMobile\(\)/,'Chrome mobile must have a dedicated performance path');
assert.match(ts,/window\.visualViewport/,'the canvas must use the actual browser content viewport');
assert.match(ts,/canvasWidth=portrait\?height:width/,'portrait browsers must expose their long dimension as landscape width');
assert.match(ts,/canvasHeight=portrait\?width:height/,'portrait browsers must expose their short dimension as landscape height');
assert.match(ts,/virtual-landscape/,'portrait mobile browsers must activate the virtual landscape shell');
assert.match(ts,/compact-landscape/,'short phone canvases must have an explicit playable layout mode');
assert.match(ts,/phone-landscape/,'phone-sized virtual landscape canvases must have a dedicated non-overflow layout');
assert.match(ts,/const phoneLandscape=canvasHeight<=520/,'phone layout must be selected from the effective landscape canvas height');
assert.match(ts,/setTimeout\(\(\)=>\{mobileCanvasTimer=undefined;syncMobileCanvas\(\);\},140\)/,'continuous visualViewport resize events must be coalesced before relayout');
assert.match(ts,/if\(canvasWidth!==lastCanvasWidth\)/,'unchanged canvas width must not rewrite layout variables');
assert.match(ts,/if\(canvasHeight!==lastCanvasHeight\)/,'unchanged canvas height must not rewrite layout variables');
assert.doesNotMatch(ts,/orientation\.lock|requestFullscreen|hanafuda-ui-profile/,'launch must not rotate the OS, force fullscreen, or call an orientation service');

assert.match(css,/html\.mobile-webapp\.virtual-landscape \.webapp-viewport[^\n]*rotate\(90deg\)/,'only the completed landscape canvas may be placed sideways inside a portrait browser');
assert.doesNotMatch(css,/\.app-shell[^\n]*rotate\(|\.screen[^\n]*rotate\(|\.board[^\n]*rotate\(/,'internal UI must be authored as landscape, not as a rotated portrait layout');
assert.match(css,/grid-template-columns:minmax\(92px,13%\) minmax\(0,74%\) minmax\(92px,13%\)/,'the field must dominate while capture rails stay secondary');
assert.match(css,/grid-template-rows:64px minmax\(0,1fr\) 118px/,'the player hand must receive more vertical space than the opponent hand');
assert.match(css,/\.field-card-button \.card\{[^\n]*height:clamp\(80px,[^\n]*108px\)/,'field cards must stay readable instead of stretching to the whole board');
assert.match(css,/\.hand-card-button \.card\{[^\n]*height:clamp\(90px,[^\n]*118px\)/,'player hand cards must be the largest interactive cards');
assert.match(css,/\.hand-card-button\{[^\n]*min-width:58px;min-height:98px/,'player hand touch targets must remain large');
assert.match(css,/\.card-back\{[^\n]*height:54px/,'opponent hand must remain visible without competing with player cards');
assert.match(css,/\.captured-row \.card\{[^\n]*height:clamp\(32px,[^\n]*43px\)/,'captured cards must be compact status information');
assert.match(css,/\.player-zone>\.captured-box\{grid-column:1/,'player captures must remain on the left rail');
assert.match(css,/\.opponent-zone>\.captured-box\{grid-column:3/,'opponent captures must remain on the right rail');
assert.match(css,/\.koi-choice button\{min-height:64px/,'koi/agari choices must be large, immediate touch actions');
assert.match(css,/\.capture-trail span\{width:48px/,'transient capture effects must never cover the whole table');
assert.match(css,/html\.mobile-webapp\.compact-landscape/,'short Safari viewports must retain a dedicated playable layout');
assert.match(css,/\.match-screen>\.modal-layer\{position:absolute;inset:0/,'match modals including koi/agari must be anchored to the rotated landscape screen, not the portrait viewport');
assert.match(css,/#app>\.fx-layer\{position:absolute/,'dynamic agari/koi effects must be anchored inside the virtual landscape app');
assert.match(css,/\.callout \.particle\{display:none!important\}/,'phone callouts must not animate particle swarms');
assert.match(css,/backdrop-filter:none/,'mobile overlays must disable expensive backdrop filtering');
assert.match(css,/chrome-mobile \.webapp-viewport\{[^\n]*will-change:transform[^\n]*contain:layout paint size style/,'Chrome mobile must keep the rotated app in one composited contained layer');
assert.match(css,/chrome-mobile \.card[^\n]*filter:none!important/,'Chrome mobile cards must avoid expensive per-card filters');
assert.match(pacingCss,/phone-landscape \.table-action-card[\s\S]*filter:none!important/,'phone card motion must disable expensive image filters');
assert.match(pacingCss,/translate3d/,'mobile-friendly action motion must use compositor transforms');

assert.match(phoneCss,/html\.mobile-webapp\.phone-landscape \.hero\{[^\n]*height:calc\(var\(--table-h\) - 10px\)/,'phone home must fit inside the real virtual table height');
assert.match(phoneCss,/grid-template-columns:minmax\(150px,34%\) minmax\(0,66%\)/,'phone home must reserve bounded title and action columns');
assert.match(phoneCss,/\.home-actions\{[^\n]*grid-template-rows:repeat\(2,minmax\(0,1fr\)\)/,'phone home actions must divide the available height rather than force minimum row heights');
assert.match(phoneCss,/\.home-actions button\{[^\n]*min-height:0[^\n]*height:100%/,'phone buttons must not overflow the virtual canvas due to inherited minimum heights');
assert.match(phoneCss,/\.home-actions button:first-child\{grid-column:auto\}/,'phone CPU button must not span both columns');

console.log('mobile DS-style match hierarchy contract: PASS');
