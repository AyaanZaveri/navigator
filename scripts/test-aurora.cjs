const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, globals = {}, dependencies = {}) {
    const context = { exports: {}, console, setTimeout, clearTimeout, ...globals, require(name) {
        return name in dependencies ? dependencies[name] : require(name);
    } };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText, context);
    return context.exports;
}
const palette = load('lib/aurora-palette.ts');
const artwork = load('lib/artwork.ts', { URLSearchParams });
const colors = palette.selectAuroraColors([
    { hex: '#140a07', population: 1000 },
    { hex: '#171310', population: 800 },
    { hex: '#d74b22', population: 10 },
]);
assert.equal(colors[0], '#d74b22', 'Vivid artwork color must outrank near-black majority pixels');
for (const hex of colors) {
    const rgb = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
    assert.ok((Math.max(...rgb) + Math.min(...rgb)) / 510 >= 0.47, 'Shader colors need visible lightness');
}
assert.equal(palette.selectAuroraColors([{ hex: '#332211', population: 1 }]).length, 3, 'Monochromatic artwork still needs three shader stops');
assert.equal(palette.selectAuroraColors([]), null);
console.log('PASS: dark artwork remains visible, vivid colors lead, and a single swatch is supported.');

const { hooks } = require('./test-support/react-hooks.cjs');
const transition = load('lib/aurora-transition.ts');
const red = ['#ff0000', '#ff0000', '#ff0000'];
const blue = ['#0000ff', '#0000ff', '#0000ff'];
const green = ['#00ff00', '#00ff00', '#00ff00'];
const track = transition.createAuroraTransition(red);
let shader;
const buffer = track.value;
track.target(blue, 0);
assert.equal(track.sample(0)[0], 1, 'Retargeting starts at the displayed color');
track.sample(240);
assert.equal(track.value[0], 0.5);
assert.equal(track.value[2], 0.5);
track.target(green, 240);
assert.equal(track.sample(240)[0], 0.5, 'Rapid navigation cannot jump to an obsolete target');
assert.equal(track.value[2], 0.5);
track.sample(720);
assert.equal(track.value[1], 1);
assert.equal(track.value, buffer, 'Steady frames reuse the uniform buffer');
assert.equal(track.active, false);
track.target(blue, 800, true);
assert.equal(track.value[2], 1, 'Reduced motion updates without a color animation');
assert.equal(track.active, false);
console.log('PASS: palette blending is continuous, interruptible and allocation-free between targets.');

function rendererTest(unavailable = false) {
  const h = hooks(), frames = new Map(), docEvents = new Map(), motionEvents = new Map();
  let now = 0, nextFrame = 0, draws = 0, renderers = 0, deletes = 0, forcedLosses = 0;
  let observerCallback, resized, uniforms, canvas;
  const fallback = { style: {} };
  const container = { offsetWidth: 390, offsetHeight: 844, appendChild(node) { node.parentNode = this; } };
  const motion = { matches: false, addEventListener: (name, cb) => motionEvents.set(name, cb), removeEventListener: name => motionEvents.delete(name) };
  const document = { hidden: false, addEventListener: (name, cb) => docEvents.set(name, cb), removeEventListener: name => docEvents.delete(name) };
  const ogl = {
    Renderer: class {
      constructor(options) {
        renderers++;
        assert.equal(options.antialias, false);
        assert.equal(options.dpr, 1);
        if (unavailable === true) throw Error('No GPU');
        canvas = { style: {}, listeners: new Map(),
          addEventListener(name, cb) { this.listeners.set(name, cb); },
          removeEventListener(name) { this.listeners.delete(name); },
          remove() { this.parentNode = null; } };
        this.gl = { canvas, clearColor() {}, enable() {}, blendFunc() {}, getProgramParameter: () => unavailable !== 'shader', getExtension: () => ({ loseContext() { forcedLosses++; } }) };
      }
      setSize(w, height) { canvas.width = w; canvas.height = height; }
      render() { draws++; }
    },
    Program: class { constructor(_, options) { shader = options.fragment; this.uniforms = uniforms = options.uniforms; } remove() { deletes++; } },
    Mesh: class {}, Triangle: class { attributes = {}; remove() { deletes++; } },
  };
  const component = load('components/Aurora/AuroraTransition.tsx', {
    requestAnimationFrame: cb => { frames.set(++nextFrame, cb); return nextFrame; },
    cancelAnimationFrame: id => frames.delete(id), document,
    performance: { now: () => now },
    ResizeObserver: class { constructor(cb) { resized = cb; } observe() {} disconnect() {} },
    IntersectionObserver: class { constructor(cb) { observerCallback = cb; } observe() {} disconnect() {} },
    window: { matchMedia: () => motion },
  }, { react: h.react, 'react/jsx-runtime': h.jsx, ogl, '@/lib/aurora-transition': transition }).default;
  const render = props => {
    const tree = h.render(component, props);
    tree.props.ref.current = container;
    tree.props.children.props.ref.current = fallback;
    h.flush();
  };
  const advance = time => { now = time; const work = [...frames.values()]; frames.clear(); work.forEach(cb => cb(time)); };
  render({ colorStops: red });
  if (unavailable) {
    assert.equal(fallback.style.opacity, '0.4');
    assert.equal(frames.size, 0, 'Static fallback must not run an idle animation loop');
    render({ colorStops: blue });
    advance(240);
    assert.ok(fallback.style.backgroundImage.includes('128 0 128'), 'CPU fallback blends instead of snapping');
    advance(480);
    assert.equal(frames.size, 0);
    h.unmount();
    return;
  }
  assert.equal(fallback.style.opacity, '0', 'CSS fallback must not double the GPU glow');
  const updates = h.updates;
  const initialDraws = draws;
  for (let i = 1; i <= 60; i++) advance(i * 1000 / 60);
  assert.ok(draws - initialDraws <= 31, 'Ambient drawing is capped at 30 fps');
  assert.equal(h.updates, updates, 'Animation frames must not rerender React');
  render({ colorStops: blue, amplitude: 1.2 });
  assert.equal(renderers, 1, 'Palette and amplitude changes reuse the same WebGL context');
  advance(1240);
  assert.ok(uniforms.uColorStops.value[0] > 0 && uniforms.uColorStops.value[2] > 0);
  container.offsetWidth = 800; resized();
  assert.equal(uniforms.uResolution.value[0], 800);
  document.hidden = true; docEvents.get('visibilitychange')();
  assert.equal(frames.size, 0, 'Background tabs release their animation loop');
  document.hidden = false; docEvents.get('visibilitychange')();
  assert.equal(frames.size, 1);
  observerCallback([{ isIntersecting: false }]);
  assert.equal(frames.size, 0);
  observerCallback([{ isIntersecting: true }]);
  motion.matches = true; motionEvents.get('change')();
  assert.equal(frames.size, 0, 'Reduced motion draws once');
  render({ colorStops: green, paused: true });
  assert.equal(frames.size, 0, 'Playback/hidden surfaces do no GPU work');
  motion.matches = false;
  render({ colorStops: green, paused: false });
  assert.equal(frames.size, 1);
  canvas.listeners.get('webglcontextlost')({ preventDefault() {} });
  assert.equal(fallback.style.opacity, '0.4');
  canvas.listeners.get('webglcontextrestored')();
  render({ colorStops: green });
  assert.equal(renderers, 2, 'Restored GPU contexts recreate their resources');
  h.replay();
  assert.equal(renderers, 3, 'Strict Mode cleanup/setup remains usable');
  h.unmount();
  assert.equal(frames.size, 0);
  assert.equal(docEvents.size, 0);
  assert.equal(motionEvents.size, 0);
  assert.equal(forcedLosses, 0);
  assert.equal(deletes, 6, 'Every context releases both program and geometry');
}
rendererTest();
rendererTest(true);
rendererTest('shader');
console.log('PASS: persistent GPU lifecycle, frame cap, visibility/playback/reduced-motion pausing, fallback blending and context recovery.');

// Exercise the installed OGL uniform binder, rather than assuming a typed
// buffer is accepted for every GLSL declaration (vec3 arrays are special).
const { Program } = require('ogl');
const uploads = [];
const matrix = /uniform mat3 uColorStops;/.test(shader);
const gl = new Proxy({
  canvas: {}, LINK_STATUS: 1, ACTIVE_UNIFORMS: 2, ACTIVE_ATTRIBUTES: 3,
  renderer: new Proxy({ state: { currentProgram: null, uniformLocations: new Map() } }, { get: (o, k) => o[k] ?? (() => {}) }),
  createShader: () => ({}), createProgram: () => ({}), getShaderInfoLog: () => '',
  getProgramParameter: (_, type) => type === 1 ? true : type === 2 ? 1 : 0,
  getActiveUniform: () => ({ name: matrix ? 'uColorStops' : 'uColorStops[0]', type: matrix ? 35675 : 35665 }),
  getUniformLocation: () => 'palette',
  uniformMatrix3fv: (_, transpose, value) => { assert.equal(transpose, false); uploads.push(Array.from(value)); },
  uniform3fv: (_, value) => uploads.push(Array.from(value)),
}, { get: (object, key) => object[key] ?? (() => {}) });
const colorTrack = transition.createAuroraTransition(red);
const program = new Program(gl, { vertex: 'void main() {}', fragment: shader, uniforms: { uColorStops: { value: colorTrack.value } } });
program.use();
assert.deepEqual(uploads.at(-1), Array.from(colorTrack.value), 'Actual OGL must deliver all nine palette channels to WebGL');
program.use();
assert.equal(uploads.length, 1, 'Unchanged palette uniforms must not be uploaded again');
colorTrack.target(blue, 0); colorTrack.sample(240); program.use();
assert.equal(uploads.length, 2, 'In-place palette changes must still reach WebGL');
assert.equal(uploads.at(-1)[2], 0.5);
program.remove();
console.log('PASS: installed OGL uploads the shared palette buffer and skips unchanged uniform data.');
