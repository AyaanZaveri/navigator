const fs = require('node:fs');
const vm = require('node:vm');
const ts = require(process.cwd() + '/node_modules/typescript');
let lost = false, draws = 0, shaderFailure = false, webglDisabled = false;
const listeners = new Map();
const constants = new Map();
const gl = new Proxy({
  getShaderParameter: () => !lost && !shaderFailure,
  isContextLost: () => lost,
  getProgramParameter: (_, param) => param === gl.ACTIVE_UNIFORMS ? 0 : !lost,
  getExtension: () => ({ loseContext() { lost = true; } }),
  drawArrays() { if (!lost) draws++; },
}, { get(target, key) {
  if (key in target) return target[key];
  if (/^[A-Z_0-9]+$/.test(key)) { if (!constants.has(key)) constants.set(key, constants.size + 1); return constants.get(key); }
  return () => ({});
}});
const canvas = { getContext: () => webglDisabled ? null : gl, addEventListener(name, fn) { listeners.set(name, fn); }, removeEventListener(name) { listeners.delete(name); }, width: 1, height: 1 };
const container = { clientWidth: 390, clientHeight: 844 };
const ctx2d = { clearRect() {}, fillRect() {}, fillText() {}, getImageData: () => ({ data: [30, 180, 120, 255] }) };
let effects = [], refIndex = 0, stateIndex = 0;
const refs = [], states = [];
const react = {
  useRef(initial) {
    const i = refIndex++;
    return refs[i] ??= { current: i === 0 ? container : i === 1 ? canvas : initial };
  },
  useState(initial) {
    const i = stateIndex++;
    if (!(i in states)) states[i] = initial;
    return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }];
  },
  useEffect(fn) { effects.push(fn); },
  createElement() {},
};
const source = ts.transpileModule(fs.readFileSync('components/gradient-ascii/gradient-ascii.jsx', 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS },
}).outputText;
const sandbox = { React: react, exports: {}, require: (name) => name === 'react' ? react : {},
  Float32Array, Map, Math,
  requestAnimationFrame: () => 1, cancelAnimationFrame() {},
  ResizeObserver: class { observe() {} disconnect() {} },
  IntersectionObserver: class { observe() {} disconnect() {} },
  window: { matchMedia: () => ({ matches: false }), devicePixelRatio: 1, addEventListener() {}, removeEventListener() {} },
  document: { createElement: () => ({ getContext: () => ctx2d }), hidden: false, addEventListener() {}, removeEventListener() {} },
};
vm.runInNewContext(source, sandbox);
// Evaluate the actual component and effect bodies with a small WebGL lifecycle
// model. This is not a GPU/pixel test: it catches destructive cleanup and
// verifies that context-restoration events rebuild the real renderer.
function render() {
  refIndex = stateIndex = 0;
  effects = [];
  sandbox.exports.default({ colors: ['#00b880', '#b4ffdf'] });
}
render();
const removeListeners = effects[0]();
const setup = effects[1];
const assert = require('node:assert/strict');
const cleanup = setup();
assert.ok(draws > 0, 'First setup must draw');
cleanup();
assert.equal(lost, false, 'Cleanup must allow effect setup on the same canvas');
const beforeReplay = draws;
const cleanupReplay = setup();
assert.ok(draws > beforeReplay, 'Strict Mode replay must render');
console.log('PASS: setup → cleanup → setup renders on the same canvas');

lost = true;
let prevented = false;
listeners.get('webglcontextlost')({ preventDefault() { prevented = true; } });
assert.equal(prevented, true, 'Context loss must permit restoration');
assert.equal(states[1], false, 'Lost canvas must be hidden, revealing CSS background');
lost = false;
listeners.get('webglcontextrestored')();
assert.equal(states[0], 1, 'Restore must invalidate renderer resources');
cleanupReplay();
render();
const beforeRestore = draws;
const cleanupRestored = effects[1]();
assert.ok(draws > beforeRestore, 'Restore must rebuild and draw');
assert.equal(states[1], true, 'Canvas is shown only after a successful draw');
console.log('PASS: context loss hides the canvas; restoration rebuilds resources');
cleanupRestored();

shaderFailure = true;
states[1] = false;
render();
const beforeFailure = draws;
effects[1]();
assert.equal(draws, beforeFailure, 'Failed shaders must not draw');
assert.equal(states[1], false, 'CSS fallback must remain visible on shader failure');
console.log('PASS: shader initialization failure leaves the CSS background visible');
webglDisabled = true;
shaderFailure = false;
render();
effects[1]();
assert.equal(states[1], false, 'WebGL unavailability must preserve the CSS fallback');
console.log('PASS: WebGL unavailable leaves the CSS background visible');

// Render the actual home background on the server with theme unresolved.
// The fallback must exist before hydration, independent of React theme state.
const React = require(process.cwd() + '/node_modules/react');
const { renderToStaticMarkup } = require(process.cwd() + '/node_modules/react-dom/server');
let resolvedTheme;
let hydrated = false;
const homeModule = { exports: {}, React, require(name) {
  if (name === 'react') return { useSyncExternalStore: () => hydrated };
  if (name.endsWith('.module.css')) return { __esModule: true, default: { background: 'home-gradient-background', animation: 'home-gradient-animation' } };
  if (name === 'next-themes') return { useTheme: () => ({ resolvedTheme }) };
  return { __esModule: true, default: props => React.createElement('canvas', { 'data-gradient': true, 'data-light-mode': String(props.lightMode), 'data-glyph-opacity': props.glyphOpacity, 'data-gradient-opacity': props.gradientOpacity }) };
}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/home-gradient-background.tsx', 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS },
}).outputText, homeModule);
let serverMarkup;
for (const hydrationState of [false, true]) {
  hydrated = hydrationState;
  for (const theme of [undefined, 'light', 'dark']) {
    resolvedTheme = theme;
    const html = renderToStaticMarkup(React.createElement(homeModule.exports.HomeGradientBackground));
    assert.ok(html.includes('home-gradient-background'), `CSS background required for ${theme}`);
    assert.ok(!html.includes('style='), 'No inline light background may override the CSS dark theme');
    assert.equal(html.includes('data-gradient'), hydrated, 'GPU layer must appear in both themes after hydration');
    if (hydrated) {
      assert.ok(html.includes(`data-light-mode="${theme !== 'dark'}"`), 'Shader mode must match the resolved theme');
      assert.ok(html.includes(`data-glyph-opacity="0.85"`), 'Dots remain visible in both themes');
    }
    if (!hydrated) {
      serverMarkup ??= html;
      assert.equal(html, serverMarkup, 'Server and first hydration render must match, even when client theme is dark');
    }
  }
}
console.log('PASS: server and first hydration markup match for unresolved, light and dark themes');
console.log('PASS: the same GPU layer mounts in both themes after hydration');
removeListeners();
assert.equal(listeners.size, 0, 'All context listeners are removed');
