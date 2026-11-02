const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
let transfer = 'pq', blocked = false, framesClosed = 0, draws = 0, captures = 0;
let lastDraw;
let mutation;
const callbacks = new Map(), events = new Map();
let id = 0;
const props = new Map(), attrs = new Map();
const surface = {
  style: { setProperty: (k,v) => props.set(k,v), removeProperty: k => props.delete(k) },
  hasAttribute: k => attrs.has(k), getAttribute: k => attrs.get(k),
  setAttribute: (k,v) => attrs.set(k,v), removeAttribute: k => attrs.delete(k),
  getClientRects: () => [1], getBoundingClientRect: () => ({ left: 10, top: 20 }),
};
const context2d = { fillRect() {}, save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, drawImage(...args) { lastDraw = args; draws++; if (blocked) throw Error('SecurityError'); } };
const canvas = { getContext: (_, options) => { assert.equal(options.colorSpace, 'srgb'); return context2d; }, toDataURL: () => { captures++; return 'data:image/jpeg;base64,fixture'; } };
const doc = { hidden: false, body: {}, querySelectorAll: () => [surface], createElement: () => canvas,
  addEventListener: (k,v) => events.set(k,v), removeEventListener: k => events.delete(k) };
class Video extends EventTarget {
  readyState = 2; videoWidth = 3840; videoHeight = 2160;
  getBoundingClientRect() { return { left: 0, top: 0, width: 1000, height: 500 }; }
  requestVideoFrameCallback(fn) { callbacks.set(++id, fn); return id; }
  cancelVideoFrameCallback(key) { callbacks.delete(key); }
}
const context = { exports: {}, document: doc,
  window: { innerWidth: 1000, innerHeight: 500, addEventListener: (k,v) => events.set(k,v), removeEventListener: k => events.delete(k) },
  VideoFrame: class { colorSpace = { transfer }; close() { framesClosed++; } },
  getComputedStyle: node => node === surface ? { visibility: attrs.has('hidden') ? 'hidden' : 'visible', backgroundColor: 'rgba(0,0,0,.64)', backgroundImage: 'none' } : { objectFit: 'contain' },
  MutationObserver: class { constructor(fn) { mutation = fn; } observe() {} disconnect() {} },
};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/media/browser-player-glass.ts', 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, context);
const tick = time => { const queued = [...callbacks.values()]; callbacks.clear(); for (const fn of queued) fn(time, {}); };
const attach = () => context.exports.attachBrowserPlayerGlass(new Video());
let cleanup = attach();
assert.ok(attrs.has('data-browser-glass'), 'HDR controls receive an actual video bitmap instead of sampling the HDR overlay');
assert.equal(framesClosed, 1, 'HDR inspection releases its VideoFrame immediately');
assert.equal(props.get('--browser-glass-x'), '-10px');
assert.equal(props.get('--browser-glass-y'), '-20px');
assert.equal(props.get('--browser-glass-size'), '1000px 500px');
assert.ok(canvas.width <= 640 && canvas.height <= 360, 'Readback is bounded regardless of the source resolution');
assert.ok(lastDraw[1] > 0 && lastDraw[3] < canvas.width, 'Fit mode keeps the same black bars as playback');
assert.equal(lastDraw[4], canvas.height);
const beforeMutation = captures;
mutation([]); mutation([]);
assert.equal(captures, beforeMutation, 'DOM updates reuse the current image instead of repeatedly reading back HDR video');
const before = captures;
tick(0); tick(100); tick(200); tick(300);
assert.ok(captures - before <= 2, 'HDR readback is limited to four samples per second');
attrs.set('hidden', ''); mutation([]);
assert.equal(callbacks.size, 0, 'Hidden controls stop video sampling');
attrs.delete('hidden'); mutation([]);
assert.ok(callbacks.size > 0, 'Showing a surface resumes sampling');
doc.hidden = true; events.get('visibilitychange')();
assert.equal(callbacks.size, 0, 'Background tabs stop sampling');
cleanup();
assert.equal(props.size, 0); assert.equal(attrs.has('data-browser-glass'), false); assert.equal(events.size, 0);
doc.hidden = false; transfer = 'bt709'; const previous = draws;
cleanup = attach(); assert.equal(draws, previous, 'SDR uses the ordinary CSS backdrop without a canvas copy'); cleanup();
transfer = 'hlg';
cleanup = attach(); assert.ok(attrs.has('data-browser-glass'), 'HLG is detected as well as PQ'); cleanup();
transfer = 'hlg'; blocked = true;
cleanup = attach(); assert.equal(attrs.has('data-browser-glass'), false, 'Restricted readback retains ordinary CSS glass');
assert.equal(callbacks.size, 0, 'Restricted sources must not create a failing capture loop'); cleanup();
assert.equal(props.size, 0);
console.log('PASS: HDR-only sRGB glass, bounded demand-driven sampling, visibility cancellation, SDR/security fallback and cleanup');
