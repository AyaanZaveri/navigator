const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
function load(file, resolve, globals = {}) {
  const context = { exports: {}, require: resolve, console, ...globals };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, context);
  return context.exports;
}
function find(node, predicate) {
  if (!node || typeof node !== 'object') return [];
  return [...(predicate(node) ? [node] : []), ...React.Children.toArray(node.props?.children).flatMap(child => find(child, predicate))];
}
function Header() {}
for (const path of ['/', '/movie/tt123', '/series/tt123', '/series/tt123/1/2', '/settings', '/addons', '/search', '/library/all', '/person/1']) {
  const { LayoutContent } = load('components/layout-content.tsx', name => {
    if (name === 'react') return { ...React, useEffect() {} };
    if (name === 'react/jsx-runtime') return require(name);
    if (name === 'jotai') return { useAtom: () => [false, () => {}] };
    if (name === 'next/navigation') return { usePathname: () => path };
    if (name === '@/components/app-header') return { AppHeader: Header };
    if (name === '@/contexts/settings-context') return { useSettings: () => ({ navigatorEnabled: false }) };
    if (name === '@/lib/desktop/bridge') return { desktopBridge: () => null };
    if (name === '@/components/navigator/ai-ask') return { default: () => null };
    return new Proxy({}, { get: (_, key) => key });
  });
  const page = React.createElement('p', null, 'Page content');
  const tree = LayoutContent({ children: page, email: 'fixture@example.invalid' });
  const headers = find(tree, node => node.type === Header);
  const mains = find(tree, node => node.props?.['data-page-scroll'] !== undefined);
  assert.equal(headers.length, 1, `${path}: one persistent header`);
  assert.equal(mains.length, 1, `${path}: one page scrollport`);
  assert.equal(mains[0].props.role, 'main', `${path}: retain the main landmark on the actual scroll viewport`);
  assert.equal(find(mains[0], node => node.type === Header).length, 0, `${path}: scrolling page content must not contain the navbar`);
  assert.ok(find(mains[0], node => node.type === "p" && node.props.children === "Page content").length, `${path}: page content remains in the scrollport`);
  assert.equal(headers[0].props.overlay, /^\/(movie|series)(?:\/|$)/.test(path), `${path}: media pages retain adaptive backdrop presentation`);
  assert.equal(mains[0].props['data-header-overlay'], /^\/(movie|series)(?:\/|$)/.test(path) ? 'true' : 'false', `${path}: Mac scrollport geometry follows route changes without double-insetting media pages`);
}

// Native scrolling can move the page before its JS scroll listener runs.
// Enforce the paint boundary rather than depending on scroll-event timing:
// the scrolling content must mask the stationary backing in both themes.
const postcss = require('postcss');
const backdropCss = postcss.parse(fs.readFileSync('components/media-page/backdrop-transition.module.css', 'utf8'));
const pageSurface = backdropCss.nodes.find(node => node.type === 'rule' && node.selector === '.page');
const background = pageSurface.nodes.find(node => node.prop === 'background' || node.prop === 'background-color')?.value;
assert.equal(background, 'var(--background)', 'Media pages must mask the overscroll backing under body text even when its visibility update is late');
for (const file of ['app/(main)/movie/[id]/page.tsx', 'app/(main)/series/[id]/layout.tsx', 'components/media-page/loading.tsx']) {
  assert.ok(fs.readFileSync(file, 'utf8').includes('backdropStyles.page'), `${file}: media content and loading states must share the opaque page surface`);
}
console.log('PASS: movie, series and loading surfaces mask the overscroll backing independently of scroll-event timing');

// Exercise the actual header effect without a browser: safe-area/font changes
// must update the geometry consumed by movie, series and episode logos.
let height = 148, resized, disconnected = false;
const properties = new Map(), effects = [];
const layout = { style: { setProperty(key, value) { properties.set(key, value); } } };
const element = { closest: () => layout, getBoundingClientRect: () => ({ height }), querySelectorAll: () => [] };
const { AppHeader } = load('components/app-header.tsx', name => {
  if (name === 'react') return { ...React, useRef: () => ({ current: element }), useLayoutEffect: effect => effects.push(effect) };
  if (name === 'react/jsx-runtime') return require(name);
  if (name === '@/contexts/MediaPlayerContext') return { useIsPlayerVisible: () => false };
  return new Proxy({}, { get: (_, key) => key });
}, { cancelAnimationFrame() {}, ResizeObserver: class {
  constructor(callback) { resized = callback; }
  observe(node) { assert.equal(node, element); }
  disconnect() { disconnected = true; }
} });
const header = AppHeader({ email: 'fixture@example.invalid', overlay: true });
assert.equal(header.type, 'header');
assert.ok(!header.props.className.includes('absolute'), 'Media navbar must participate in the persistent shell, not page positioning');
const cleanup = effects[0]();
assert.equal(properties.get('--app-header-height'), '148px');
height = 164; resized();
assert.equal(properties.get('--app-header-height'), '164px', 'Native inset and font changes update logo geometry');
cleanup();
assert.equal(disconnected, true);
console.log('PASS: persistent navbar across all routes, media overlay mode, measured safe-area geometry and observer cleanup');
