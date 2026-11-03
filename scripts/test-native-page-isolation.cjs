const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const postcss = require('postcss');
const ts = require('typescript');
const { load } = require('./test-support/react-hooks.cjs');

// Follow relative CSS imports too: desktop work can move the native policy
// out of globals.css without removing this cross-platform regression coverage.
function rules(file) {
  const result = [];
  const sheet = postcss.parse(fs.readFileSync(file, 'utf8'));
  for (const node of sheet.nodes) {
    const imported = node.type === 'atrule' && node.name === 'import' && node.params.match(/^["'](\.[^"']+)["']/);
    if (imported) result.push(...rules(path.resolve(path.dirname(file), imported[1])));
    else if (node.type === 'rule') result.push(node);
  }
  return result;
}
const nativeRules = rules('app/globals.css');
function pagePolicy(attributes) {
  const policy = {};
  for (const rule of nativeRules) {
    // The real retained page boundary, not controls or descendants inside it.
    for (const selector of rule.selector.split(',')) {
      if (!/^html(?:\[[^\]]+\])+ \[data-desktop-app-content\]$/.test(selector.trim())) continue;
      const requirements = [...selector.matchAll(/\[([^=\]]+)(?:="([^"]+)")?\]/g)].slice(0, -1);
      if (!requirements.every(([, key, value]) => key in attributes && (!value || attributes[key] === value))) continue;
      for (const declaration of rule.nodes) if (declaration.type === 'decl') policy[declaration.prop] = declaration.value;
    }
  }
  return policy;
}
const hero = postcss.parse(fs.readFileSync('components/hero-wordmark.module.css', 'utf8'));
const readyWordmark = hero.nodes.find(node => node.selector === '.root[data-ready] .artwork');
const wordmarkVisibility = readyWordmark.nodes.find(node => node.prop === 'visibility')?.value;

// Obtain the overscroll surface from the real hook after its bitmap is ready.
let setup, frame, surface;
const image = { complete: true, naturalWidth: 1920, naturalHeight: 1080, clientWidth: 1200, clientHeight: 500,
  closest: () => scroller, addEventListener() {}, removeEventListener() {} };
const scroller = { offsetLeft: 0, offsetTop: 0, clientWidth: 1200, clientHeight: 900,
  parentElement: { append(node) { surface = node; } }, addEventListener() {}, removeEventListener() {} };
const document = { createElement() { return { style: {}, setAttribute() {}, append() {}, remove() {},
  getContext: () => ({ drawImage() {} }) }; } };
const { useBackdropOverscroll } = load('components/media-page/use-backdrop-overscroll.ts', {
  react: { useEffect(fn) { setup = fn; } },
  './backdrop-transition.module.css': {},
  '@/lib/logo-contrast': { getLogoSampleCrop: () => ({ x: 0, y: 0, width: 1920, height: 12 }) },
}, { document, requestAnimationFrame(fn) { frame = fn; return 1; }, cancelAnimationFrame() {},
  ResizeObserver: class { observe() {} disconnect() {} }, getComputedStyle: () => ({ objectPosition: '50% 50%' }) });
useBackdropOverscroll({ current: image }, '/backdrop.jpg');
const cleanup = setup();
frame();
assert.equal(surface.style.visibility, 'visible', 'Reproduce the loaded overscroll layer explicitly restoring visibility');
assert.equal(wordmarkVisibility, 'visible', 'Reproduce the ready page wordmark explicitly restoring visibility');
for (const platform of ['android', 'windows', 'macos', 'ios', 'linux', undefined]) {
  const attributes = { 'data-desktop': 'mpv', 'data-native-playing': '' };
  if (platform) attributes['data-native-platform'] = platform;
  const policy = pagePolicy(attributes);
  // visibility:hidden alone cannot hide either visible descendant. Opacity
  // applies to the complete group's paint, so neither can override it.
  assert.equal(policy.opacity, '0', `${platform ?? 'legacy native bridge'}: the retained page must suppress all descendant paint, even visibility:visible artwork`);
  assert.equal(policy['pointer-events'], 'none');
  assert.notEqual(policy.display, 'none', 'Preserve page layout and scroll geometry while playing');
  assert.notEqual(policy['content-visibility'], 'hidden', 'Do not replace retained page geometry with an estimate');
  delete attributes['data-native-playing'];
  assert.notEqual(pagePolicy(attributes).opacity, '0', 'Closing native playback restores the same retained page');
}
assert.notEqual(pagePolicy({}).opacity, '0', 'Ordinary web browsing is unaffected');
cleanup();

// Hiding the retained page must never hide the player itself.
const layout = ts.createSourceFile('layout.tsx', fs.readFileSync('components/layout-content.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let tools = 0;
function visit(node, insidePage = false) {
  const tag = ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : null;
  const page = tag?.attributes.properties.some(attr => ts.isJsxAttribute(attr) && attr.name.text === 'data-desktop-app-content');
  if (tag?.tagName.getText(layout) === 'DeferredTools') { tools++; assert.equal(insidePage, false, 'Player/tool overlays must remain siblings of the hidden browsing page'); }
  ts.forEachChild(node, child => visit(child, insidePage || page));
}
visit(layout);
assert.equal(tools, 1);
console.log('PASS: ready wordmark/overscroll cannot escape the retained page on any native platform; page geometry, close restoration and sibling player remain intact');
