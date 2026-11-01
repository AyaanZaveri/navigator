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

async function testPaletteFallback() {
    const effects = [], updates = [], requests = [];
    const component = load('components/vibrant-aurora-background.tsx', {
        Image: class {}, setTimeout: callback => setTimeout(callback, 5),
    }, {
        react: { useEffect: effect => effects.push(effect) },
        jotai: { useSetAtom: () => value => updates.push(value) },
        'node-vibrant/browser': { Vibrant: { from: image => ({ getPalette() {
            const src = image.src;
            requests.push(src);
            return src.includes('backdrop') ? new Promise(() => {})
                : Promise.resolve({ Vibrant: { hex: '#d74b22', population: 10 } });
        } }) } },
        '@/components/aurora-background': { AuroraBackground: () => null },
        '@/lib/atoms': {}, '@/lib/aurora-palette': palette,
    });
    component.VibrantAuroraBackground({ backdropUrl: '/backdrop', posterUrl: '/poster' });
    const cleanup = effects[0]();
    await new Promise(resolve => setTimeout(resolve, 25));
    assert.deepEqual(requests, ['/backdrop', '/poster']);
    assert.equal(updates.length, 1, 'A stalled backdrop must not prevent poster fallback');
    cleanup();
    console.log('PASS: backdrop is preferred; stalled image extraction falls back to the poster.');
}

function testGpuFallback() {
    let effect, unavailable = true, state = 0, draws = 0, observed = false;
    const queued = [];
    const listeners = new Map();
    const canvas = { style: {}, parentNode: null, addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) };
    const container = { offsetWidth: 390, offsetHeight: 844, appendChild(node) { node.parentNode = this; }, removeChild(node) { node.parentNode = null; } };
    const gl = { canvas, clearColor() {}, enable() {}, blendFunc() {}, getExtension: () => ({ loseContext() {} }) };
    const component = load('components/Aurora/AuroraTransition.tsx', {
        requestAnimationFrame: callback => { queued.push(callback); return queued.length; }, cancelAnimationFrame() {},
        ResizeObserver: class { observe() { observed = true; } disconnect() {} },
        window: { addEventListener() {}, removeEventListener() {} },
    }, {
        react: {
            useRef: value => ({ current: value === null ? container : value }),
            useEffect: callback => { effect = callback; },
            useState: value => [value, update => { state = update(state); }],
        },
        ogl: {
            Renderer: class { constructor() { if (unavailable) throw Error('No GPU'); this.gl = gl; } setSize() {} render() { draws++; } },
            Program: class { constructor(_, options) { this.uniforms = options.uniforms; } },
            Mesh: class {}, Triangle: class { attributes = {}; }, Color: class { r = 1; g = 0.3; b = 0.1; },
        },
    });
    const tree = component.default({ colorStopsTo: ['#d74b22', '#42b8aa', '#efbe41'] });
    assert.ok(tree.props.children.props.style.backgroundImage.includes('#d74b22'), 'CSS artwork glow must exist independently of WebGL');
    assert.doesNotThrow(() => effect(), 'Unavailable WebGL must leave the fallback without throwing');
    unavailable = false;
    const cleanup = effect();
    assert.equal(observed, true, 'Container resizing must update the renderer');
    queued.shift()(0);
    assert.equal(draws, 1);
    let prevented = false;
    listeners.get('webglcontextlost')({ preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    listeners.get('webglcontextrestored')();
    assert.equal(state, 1, 'Context restoration must request fresh GPU resources');
    cleanup();
    assert.equal(listeners.size, 0);
    console.log('PASS: CSS glow survives GPU unavailability; restoration rebuilds the renderer and cleanup removes listeners.');
}
testPaletteFallback().then(testGpuFallback).catch(error => { console.error(error); process.exitCode = 1; });
