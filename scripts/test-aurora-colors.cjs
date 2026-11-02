const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { BrowserImage } = require('@vibrant/image-browser');

// Exercise Vibrant's real browser loader. Model the canvas security rule for
// our same-origin artwork URLs that redirect to TMDB's cross-origin CDN.
class TestImage {
  complete = true;
  width = 10;
  height = 10;
  set src(value) {
    this._src = value;
    // Anonymous CORS cannot make a CDN that refuses canvas access readable.
    // The first-party sample endpoint must return bytes instead of redirecting.
    this.tainted = value.startsWith('/api/artwork') && !value.includes('sample=1');
  }
  get src() { return this._src; }
}
global.HTMLImageElement = TestImage;
global.Image = TestImage;
global.location = new URL('https://navigator.test/movie/tt1');
global.window = { location: global.location };
global.document = {
  body: { appendChild() {} },
  createElement(tag) {
    if (tag === 'img') return new TestImage();
    let tainted = false;
    return { style: {}, getContext: () => ({
      drawImage(image) { tainted = image.tainted; },
      getImageData() {
        if (tainted) throw new DOMException('Canvas contains cross-origin data', 'SecurityError');
        return { data: new Uint8ClampedArray([255, 100, 0, 255]) };
      },
    }) };
  },
};

const tick = () => new Promise(resolve => setImmediate(resolve));
const source = ts.transpileModule(fs.readFileSync('components/vibrant-aurora-background.tsx', 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const palette = color => ({ Vibrant: { hex: color, population: 20 }, DarkVibrant: { hex: '#112233', population: 10 }, Muted: { hex: '#445566', population: 5 }, LightMuted: { hex: '#AABBCC', population: 3 } });
const calls = [], updates = [], pending = new Map();
let effect, rendered;
let paletteState = null;
const loadModule = file => {
  const module = { exports: {}, URLSearchParams };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, module);
  return module.exports;
};
const paletteHelpers = loadModule('lib/aurora-palette.ts');
const artworkHelpers = loadModule('lib/artwork.ts');
const Vibrant = { from(image) { return { async getPalette() {
  const loader = await new BrowserImage().load(image);
  loader.getImageData();
  const url = typeof image === 'string' ? image : image.src;
  calls.push(url);
  if (url.includes('broken')) throw new Error('Artwork unavailable');
  if (url.includes('slow')) return new Promise(resolve => pending.set(url, resolve));
  return palette(url.includes('second') ? '#3366FF' : '#FF6600');
} }; } };
const context = { exports: {}, Image: TestImage, setTimeout, clearTimeout, console: { warn() {} }, require(name) {
  if (name === 'react') return {
    useEffect: fn => { effect = fn; },
    useState: () => [paletteState, update => { paletteState = update; }],
  };
  if (name === 'react/jsx-runtime') return { jsx: (_, props) => { rendered = props; return props; } };
  if (name === 'jotai') return { useAtom: () => [['#old']], useSetAtom: () => colors => updates.push(Array.from(colors)) };
  if (name === 'node-vibrant/browser') return { Vibrant };
  if (name === '@/lib/aurora-palette') return paletteHelpers;
  if (name === '@/lib/artwork') return artworkHelpers;
  return {};
} };
vm.runInNewContext(source, context);
const render = props => {
  const tree = context.exports.VibrantAuroraBackground(props);
  if (paletteState?.sourceKey !== JSON.stringify([props.backdropUrl, props.posterUrl])) {
    assert.equal(tree, null, 'A title must not render the default or previous title palette while its artwork loads');
  }
  return effect();
};

function testTransitionLifecycle() {
  const current = ['#3366FF', '#112233', '#445566'];
  const previous = ['#FF6600', '#112233', '#445566'];
  const effects = [], frames = new Map();
  const atoms = { auroraColorsAtom: 'current', previousAuroraColorsAtom: 'previous' };
  let frameId = 0;
  const renderer = { exports: {},
    requestAnimationFrame: fn => { frames.set(++frameId, fn); return frameId; },
    cancelAnimationFrame: id => frames.delete(id),
    require(name) {
      if (name === 'react') return {
        useEffect: fn => effects.push(fn),
        useState: initial => [typeof initial === 'boolean' ? true : initial, () => {}],
      };
      if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }) };
      if (name === 'next-themes') return { useTheme: () => ({ theme: 'dark', resolvedTheme: 'dark' }) };
      if (name === 'jotai') return { useAtom: atom => [atom === 'current' ? current : previous] };
      if (name === '@/lib/atoms') return atoms;
      return {};
    },
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/aurora-background.tsx', 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, renderer);
  const tree = renderer.exports.AuroraBackground({});
  assert.equal(tree.props.children.props.colorStopsFrom, previous);
  assert.equal(tree.props.children.props.colorStopsTo, current);
  const cleanup = effects[0]();
  assert.equal(frames.size, 1);
  cleanup();
  assert.equal(frames.size, 0, 'Navigation must cancel the old transition animation frame');
  effects.length = 0;
  const localTree = renderer.exports.AuroraBackground({ colorStops: current });
  assert.equal(localTree.props.children.props.colorStopsFrom, current);
  assert.equal(localTree.props.children.props.colorStopsTo, current);
  assert.equal(effects[0](), undefined, 'An explicit title palette must not animate from stale global colors');
  assert.equal(frames.size, 0, 'A local palette must not start an unused transition loop');
}

async function run() {
  // Confirm the modeled failure with the actual dependency before testing our component.
  const unsafe = await new BrowserImage().load('/api/artwork?id=tt1&kind=backdrop');
  assert.throws(() => unsafe.getImageData(), { name: 'SecurityError' });
  const cleanupFirst = render({ backdropUrl: '/api/artwork?id=first&kind=backdrop' });
  await tick();
  assert.equal(updates.at(-1)?.[0], '#ff6600', 'TMDB redirects must produce new aurora colors instead of retaining the previous title');
  assert.equal(updates.at(-1).length, 3, 'Shader must receive exactly three color stops');
  assert.ok(calls[0].includes('sample=1'), 'Palette extraction must use same-origin bytes');
  context.exports.VibrantAuroraBackground({ backdropUrl: '/api/artwork?id=first&kind=backdrop' });
  assert.deepEqual(Array.from(rendered.colorStops), updates.at(-1), 'The visible glow must receive this title’s extracted palette');
  cleanupFirst();

  const cleanupSlow = render({ backdropUrl: '/api/artwork?id=slow&kind=backdrop' });
  await tick();
  cleanupSlow();
  const cleanupSecond = render({ backdropUrl: '/api/artwork?id=second&kind=backdrop' });
  await tick();
  assert.equal(updates.at(-1)[0], '#3366ff');
  const count = updates.length;
  pending.get('/api/artwork?id=slow&kind=backdrop&sample=1')(palette('#00FF00'));
  await tick();
  assert.equal(updates.length, count, 'A previous title finishing late must not overwrite the current title');
  cleanupSecond();

  const cleanupFallback = render({ backdropUrl: '/api/artwork?id=broken&kind=backdrop', posterUrl: '/api/artwork?id=first&kind=poster' });
  await tick();
  assert.ok(calls.includes('/api/artwork?id=first&kind=poster&sample=1'), 'A failed backdrop must try the current title poster through same-origin bytes');
  assert.equal(updates.at(-1)[0], '#ff6600');
  cleanupFallback();
  testTransitionLifecycle();
  console.log('PASS: redirect-safe palette extraction, title changes, stale-request cancellation, poster fallback, three-stop palettes, and transition cleanup');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
