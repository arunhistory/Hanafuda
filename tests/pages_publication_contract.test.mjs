import fs from 'node:fs';
import assert from 'node:assert/strict';

const config=fs.readFileSync('_config.yml','utf8');
const deploy=fs.readFileSync('.github/workflows/deploy-pages.yml','utf8');
const html=fs.readFileSync('web/index.html','utf8');

for(const required of [
  'web/src',
  'web/tsconfig.json',
  'cloudflare',
  'src',
  'tests',
  'tools',
  'assets/source',
  'assets/wasm',
]){
  assert.ok(config.includes(`- ${required}`),`branch Pages must exclude ${required}`);
}

for(const file of fs.readdirSync('.').filter(name=>name.toLowerCase().endsWith('.png'))){
  assert.ok(config.includes(`- ${file}`),`root source image must be excluded from branch Pages: ${file}`);
}

assert.match(deploy,/find web -maxdepth 1 -type f \\( -name '\*\.html' -o -name '\*\.css' \\) -exec cp \{\} _site\/web\/ \\;/,'Actions Pages assembly must copy every web-root HTML/CSS file');
assert.match(deploy,/cp -R web\/dist _site\/web\/dist/,'Actions Pages assembly must publish generated JavaScript only from dist');
assert.match(deploy,/test ! -e _site\/web\/src/,'Actions Pages assembly must reject web TypeScript source');
assert.match(deploy,/test ! -e _site\/assets\/source/,'Actions Pages assembly must reject source artwork');
assert.match(deploy,/test ! -e _site\/assets\/wasm/,'Actions Pages assembly must reject internal WASM artifacts');
assert.match(deploy,/find _site -type f -name '\*\.ts'/,'Actions Pages assembly must reject TypeScript files');
assert.match(deploy,/find _site -type f -name '\*\.cpp'/,'Actions Pages assembly must reject C++ files');
assert.match(deploy,/find _site -type f -name '\*\.mjs'/,'Actions Pages assembly must reject tooling/test JavaScript modules');

const rootJs=fs.readdirSync('web').filter(name=>name.endsWith('.js'));
assert.deepEqual(rootJs,[],'web root must not contain handwritten runtime JavaScript');

const scriptRefs=[...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(match=>match[1]);
assert.ok(scriptRefs.length>0,'web app must load generated scripts');
for(const ref of scriptRefs){
  assert.ok(ref.startsWith('./dist/'),`runtime script must load from dist: ${ref}`);
  const target=`web/${ref.slice(2)}`;
  assert.ok(fs.existsSync(target),`generated runtime referenced by HTML must exist: ${target}`);
}

const cssRefs=[...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map(match=>match[1]);
assert.ok(cssRefs.length>0,'web app must load stylesheets');
for(const ref of cssRefs){
  assert.ok(ref.startsWith('./'),`stylesheet must be a local public artifact: ${ref}`);
  const target=`web/${ref.slice(2)}`;
  assert.ok(fs.existsSync(target),`stylesheet referenced by HTML must exist: ${target}`);
}

assert.equal(fs.readdirSync('assets/cards/generated').filter(name=>name.endsWith('.png')).length,48,'public generated card set must contain exactly 48 cards');

console.log('Pages publication contract: PASS');
