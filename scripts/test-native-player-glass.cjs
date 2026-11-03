const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const css = new Map(), timers = new Map(), frames = new Map(), events = new Map(), sent = [];
let mutation, insets, receive, callback, id = 0, reads = 0;
function node(left, top, hidden) {
  const attrs = new Map(hidden ? [['aria-hidden', 'true']] : []);
  const props = new Map();
  return { attrs, props, visible: true, hasAttribute: name => attrs.has(name), getAttribute: name => attrs.get(name), setAttribute: (name, value) => attrs.set(name, value), removeAttribute: name => attrs.delete(name),
    style: { setProperty: (name, value) => props.set(name, value), removeProperty: name => props.delete(name) },
    getClientRects: () => [1], getBoundingClientRect() { reads++; return { left, top }; } };
}
const back = node(24, 16), preview = node(200, 240, true), nodes = [back, preview];
preview.attrs.set('data-slot', 'media-player-seek-tooltip');
const document = { hidden: false, body: {}, querySelectorAll: () => nodes,
  documentElement: { style: { setProperty: (name, value) => css.set(name, value), removeProperty: name => css.delete(name) } },
  addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name) };
const bridge = { platform: 'android', capabilities: { glass: true }, send: message => sent.push(message), subscribe(fn) { receive = fn; return () => { receive = null; }; } };
const context = { exports: {}, document, getComputedStyle: node => ({ visibility: node.visible ? 'visible' : 'hidden' }),
  window: { innerWidth: 1000, innerHeight: 500, addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name) },
  requestAnimationFrame(fn) { frames.set(++id, fn); return id; }, cancelAnimationFrame(id) { frames.delete(id); },
  setTimeout(fn) { timers.set(++id, fn); return id; }, clearTimeout(id) { timers.delete(id); },
  MutationObserver: class { constructor(fn) { this.fn = fn; } observe(target) { if (target === document.body) mutation = this.fn; else insets = this.fn; } disconnect() {} },
  require(name) { if (name === 'react') return { useEffect(fn) { callback = fn; } }; if (name.endsWith('/bridge')) return { desktopBridge: () => bridge }; return {}; } };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/native-player-glass.tsx', 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, context);
context.exports.NativePlayerGlass({ mediaRef: { current: { controller: { previewSession: 'current' } } }, sourceKey: 'one', ready: true });
const cleanup = callback();
assert.equal(sent.length, 1); assert.equal(sent[0].active, true);
receive({ type: 'glass-frame', session: 'old', src: 'data:image/jpeg;base64,AA==' });
assert.equal(css.size, 0, 'An old source cannot paint the current player');
const beforePixels = reads;
receive({ type: 'glass-frame', session: 'current', src: 'data:image/jpeg;base64,AA==' });
assert.equal(reads, beforePixels, 'A new video sample must never force a layout measurement');
assert.equal(css.size, 0, 'Frequently changing pixels must not invalidate inherited styles across the document');
assert.ok(back.props.get('--native-glass-image').includes('data:image/jpeg'));
assert.ok(back.attrs.has('data-native-glass'));
assert.equal(back.props.get('--native-glass-x'), '-24px');
assert.equal(back.props.get('--native-glass-size'), '1000px 500px');
assert.equal(timers.size, 0, 'Visible glass must not start a JavaScript geometry polling loop');
const measuredBeforeFrame = reads;
receive({ type: 'glass-frame', session: 'current', src: 'data:image/jpeg;base64,BB==' });
assert.equal(reads, measuredBeforeFrame, 'Continuous video updates only paint the cached visible surfaces');
assert.equal(sent.length, 1, 'Video frames must not restart capture demand');
const before = reads;
mutation([{ type: 'childList', addedNodes: [{ nodeType: 3 }], removedNodes: [] }]);
assert.equal(reads, before, 'Progress text must not trigger glass layout reads');
back.visible = false; preview.attrs.set('aria-hidden', 'false'); mutation([{ type: 'attributes' }]);
assert.ok(preview.attrs.has('data-native-glass')); assert.ok(back.attrs.has('data-native-glass'), 'Keep the existing material stable through visibility changes');
assert.equal(sent.length, 1, 'Moving visibility between glass controls does not restart the sampler');
assert.equal(preview.props.get('--native-glass-half-width'), '500px');
assert.equal(preview.props.get('--native-glass-x'), undefined, 'CSS follows the scrub position without a stale measured origin');
preview.attrs.set('aria-hidden', 'true'); mutation([{ type: 'attributes' }]);
assert.equal(sent.at(-1).active, false, 'No controls means no video sampling'); assert.equal(timers.size, 0);
const skip = node(740, 300);
nodes.push(skip);
mutation([{ type: 'childList', addedNodes: [{ nodeType: 1 }], removedNodes: [] }]);
assert.equal(sent.at(-1).active, true, 'A skip button samples native video even while playback controls are hidden');
assert.ok(skip.attrs.has('data-native-glass'), 'A newly visible skip action reuses the existing native frame');
assert.equal(skip.props.get('--native-glass-x'), '-740px');
assert.equal(skip.props.get('--native-glass-y'), '-300px');
const beforeSkipFrame = reads;
receive({ type: 'glass-frame', session: 'current', src: 'data:image/jpeg;base64,CC==' });
assert.equal(reads, beforeSkipFrame, 'Skip glass adds no layout work to frame delivery');
assert.ok(skip.props.get('--native-glass-image').includes('CC=='));
skip.attrs.set('aria-hidden', 'true'); mutation([{ type: 'attributes' }]);
assert.equal(sent.at(-1).active, false, 'Dismissing the only visible skip action releases capture demand');
back.visible = true; mutation([{ type: 'attributes' }]);
document.hidden = true; events.get('visibilitychange')();
assert.equal(sent.at(-1).active, false, 'Backgrounding stops video readback');
cleanup(); assert.equal(back.props.size, 0); assert.equal(preview.props.size, 0); assert.equal(skip.props.size, 0); assert.equal(css.size, 0); assert.equal(events.size, 0); assert.equal(timers.size, 0); assert.equal(receive, null);
document.hidden = false;
bridge.platform = 'windows';
context.exports.NativePlayerGlass({ mediaRef: { current: { controller: { previewSession: 'current' } } }, sourceKey: 'windows', ready: true });
const windowsCleanup = callback();
assert.equal(sent.at(-1).active, true, 'Windows advertises and requests actual video glass');
receive({ type: 'glass-frame', session: 'current', src: 'data:image/bmp;base64,Qk0=' });
assert.equal(frames.size, 1);
receive({ type: 'glass-frame', session: 'current', src: 'data:image/bmp;base64,LATEST' });
assert.equal(frames.size, 1, 'A burst of Windows samples queues only one display frame');
for (const [id, draw] of frames) { frames.delete(id); draw(); }
assert.ok(back.props.get('--native-glass-image').includes('LATEST'), 'Only the newest Windows sample paints');
receive({ type: 'glass-frame', session: 'current', src: 'data:image/bmp;base64,CANCEL' });
windowsCleanup();
assert.equal(frames.size, 0, 'Unmount cancels pending Windows glass paint');
console.log('PASS: native glass demand, source isolation, bounded geometry updates, visibility/background cancellation and cleanup');
