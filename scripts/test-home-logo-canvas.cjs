const assert = require('node:assert/strict');
const { load } = require('./test-support/react-hooks.cjs');
let copies = [], wakes = 0, notifications = 0;
const document = { hidden: false, createElement: () => ({
    width: 0, height: 0,
    getContext: () => ({ drawImage: (...args) => copies.push(args) }),
}) };
const registry = load('lib/logo-canvas.ts', {}, { document });
const unsubscribe = registry.subscribeLogoCanvas(() => notifications++);
const bounds = { left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 };
const canvas = { width: 1200, height: 900, getBoundingClientRect: () => bounds };
const logo = { left: 40, top: 20, width: 32, height: 32 };
const release = registry.registerLogoCanvas(canvas, () => wakes++);
assert.equal(registry.logoCanvasSurface(canvas, logo), null, 'No asynchronous read of a discarded WebGL buffer');
assert.equal(wakes, 1);
registry.captureLogoCanvas(canvas, 0);
assert.equal(notifications, 1, 'Only a completed readable frame wakes subscribers');
let surface = registry.logoCanvasSurface(canvas, logo);
assert.equal(surface.image.width, 64); assert.equal(surface.image.height, 64);
assert.deepEqual(copies[0].slice(1), [60, 30, 48, 48, 0, 0, 64, 64], 'Only the actual logo crop is read at canvas DPR');
registry.captureLogoCanvas(canvas, 50); assert.equal(copies.length, 1); assert.equal(notifications, 1);
const moved = { ...logo, top: 30 };
registry.logoCanvasSurface(canvas, moved); registry.captureLogoCanvas(canvas, 60);
assert.equal(copies.length, 1, 'Moving the crop cannot bypass the 10Hz readback limit');
registry.captureLogoCanvas(canvas, 100); assert.equal(copies.length, 2);
surface = registry.logoCanvasSurface(canvas, moved);
assert.equal(surface.rect.top, 30);
document.hidden = true; registry.captureLogoCanvas(canvas, 250); assert.equal(copies.length, 2);
document.hidden = false;
release(); assert.equal(registry.logoCanvasSurface(canvas, logo), null);
registry.captureLogoCanvas(canvas, 500); assert.equal(copies.length, 2, 'Unmount removes the crop registration');

const contrast = load('lib/logo-contrast.ts');
const painter = load('lib/logo-backdrop.ts', { '@/lib/logo-contrast': contrast });
const draws = [];
const context = { canvas: { width: 64, height: 64 }, save() {}, restore() {}, clearRect() {}, scale() {}, translate() {}, fillRect() {},
    drawImage: (...args) => draws.push(args),
};
painter.paintLogoBackdrop(context, moved, '#ffffff', surface, []);
assert.equal(draws.length, 1, 'Canvas snapshots pass through the existing backdrop compositor');
assert.deepEqual(draws[0].slice(1, 5), [0, 0, 64, 64]);
const surfaces = load('lib/logo-surfaces.ts', { './logo-canvas': registry });
const scope = { querySelectorAll(selector) { assert.ok(selector.includes('canvas[data-logo-surface]')); return [canvas]; }, contains: element => element === canvas };
canvas.parentElement = scope; canvas.tagName = 'CANVAS'; canvas.compareDocumentPosition = () => 0;
const viewport = { parentElement: scope, getBoundingClientRect: () => ({ left: 0, top: 85, width: 800, height: 515 }),
    style: { overflowY: 'auto', overflowX: 'hidden' } };
const fixed = { parentElement: viewport, getBoundingClientRect: () => bounds, style: { position: 'fixed' } };
canvas.parentElement = fixed;
const again = registry.registerLogoCanvas(canvas, () => {});
registry.logoCanvasSurface(canvas, moved); registry.captureLogoCanvas(canvas, 600);
const collect = () => surfaces.collectLogoSurfaces(scope, { contains: () => false }, moved,
    element => ({ display: 'block', visibility: 'visible', opacity: '1', overflowX: 'visible', overflowY: 'visible', ...element.style }), () => []);
const collected = collect();
assert.equal(collected.length, 1); assert.ok('image' in collected[0], 'The real surface collector includes pointer-free canvas paint');
viewport.style.transform = 'matrix(1,0,0,1,0,0)';
assert.equal(collect().length, 0, 'A containing-block transform restores local overflow clipping');
again(); unsubscribe();
console.log('PASS: draw-time 64px logo crops, DPR geometry, strict 10Hz limit, visibility/lifecycle cleanup and canvas-backed logo compositing.');
