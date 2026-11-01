const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const css = new Map(), timers = new Map(), events = new Map(), sent = [];
let mutation, receive, callback, id = 0, reads = 0;
function node(left, top, hidden) {
  const attrs = new Map(hidden ? [['aria-hidden', 'true']] : []);
  const props = new Map();
  return { attrs, props, visible: true, getAttribute: name => attrs.get(name), setAttribute: (name, value) => attrs.set(name, value), removeAttribute: name => attrs.delete(name),
    style: { setProperty: (name, value) => props.set(name, value), removeProperty: name => props.delete(name) },
    getClientRects: () => [1], getBoundingClientRect() { reads++; return { left, top }; } };
}
const back = node(24, 16), preview = node(200, 240, true), nodes = [back, preview];
const document = { hidden: false, body: {}, querySelectorAll: () => nodes,
  documentElement: { style: { setProperty: (name, value) => css.set(name, value), removeProperty: name => css.delete(name) } },
  addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name) };
const bridge = { platform: 'android', capabilities: { glass: true }, send: message => sent.push(message), subscribe(fn) { receive = fn; return () => { receive = null; }; } };
const context = { exports: {}, document, getComputedStyle: node => ({ visibility: node.visible ? 'visible' : 'hidden' }),
  window: { innerWidth: 1000, innerHeight: 500, addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name) },
  setTimeout(fn) { timers.set(++id, fn); return id; }, clearTimeout(id) { timers.delete(id); },
  MutationObserver: class { constructor(fn) { mutation = fn; } observe() {} disconnect() {} },
  require(name) { if (name === 'react') return { useEffect(fn) { callback = fn; } }; if (name.endsWith('/bridge')) return { desktopBridge: () => bridge }; return {}; } };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/native-player-glass.tsx', 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, context);
context.exports.NativePlayerGlass({ mediaRef: { current: { controller: { previewSession: 'current' } } }, sourceKey: 'one', ready: true });
const cleanup = callback();
assert.equal(sent.length, 1); assert.equal(sent[0].active, true);
receive({ type: 'glass-frame', session: 'old', src: 'data:image/jpeg;base64,AA==' });
assert.equal(css.size, 0, 'An old source cannot paint the current player');
receive({ type: 'glass-frame', session: 'current', src: 'data:image/jpeg;base64,AA==' });
assert.ok(css.get('--native-glass-image').includes('data:image/jpeg'));
assert.ok(back.attrs.has('data-native-glass'));
assert.equal(back.props.get('--native-glass-x'), '-24px');
assert.equal(back.props.get('--native-glass-size'), '1000px 500px');
const before = reads;
mutation([{ type: 'childList', addedNodes: [{ nodeType: 3 }], removedNodes: [] }]);
assert.equal(reads, before, 'Progress text must not trigger glass layout reads');
back.visible = false; preview.attrs.set('aria-hidden', 'false'); mutation([{ type: 'attributes' }]);
assert.ok(preview.attrs.has('data-native-glass')); assert.ok(back.attrs.has('data-native-glass'), 'Keep the existing material stable through visibility changes');
assert.equal(sent.length, 1, 'Moving visibility between glass controls does not restart the sampler');
preview.attrs.set('aria-hidden', 'true'); mutation([{ type: 'attributes' }]);
assert.equal(sent.at(-1).active, false, 'No controls means no video sampling'); assert.equal(timers.size, 0);
back.visible = true; mutation([{ type: 'attributes' }]);
document.hidden = true; events.get('visibilitychange')();
assert.equal(sent.at(-1).active, false, 'Backgrounding stops video readback');
cleanup(); assert.equal(css.size, 0); assert.equal(events.size, 0); assert.equal(timers.size, 0); assert.equal(receive, null);
console.log('PASS: native glass demand, source isolation, bounded geometry updates, visibility/background cancellation and cleanup');
