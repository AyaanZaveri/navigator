const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
let mutations, resized, measured = 0, top = 240;
const sent = [], attributes = new Map();
const node = () => ({ hasAttribute: name => attributes.has(name), setAttribute: (name, value) => attributes.set(name, value) });
const title = node(), heading = node(), meta = node(), endTime = node(), toolbar = node();
heading.children = [title, endTime]; heading.nextElementSibling = meta; title.parentElement = heading; title.closest = () => null;
toolbar.querySelector = () => ({});
const button = { ...node(), getAttribute: name => attributes.get(name), childNodes: [{ nodeType: 3, textContent: 'Go Back' }] };
const controls = { getBoundingClientRect() { measured++; return { top, bottom: 380, width: 850, height: 380 - top }; }, querySelector: () => title, lastElementChild: toolbar };
let mounted = true;
const shell = { querySelector: () => controls, querySelectorAll: selector => selector === 'h2' ? [title] : [button] };
const document = { querySelector: () => mounted ? shell : null };
const listeners = new Map();
const window = { innerWidth: 850, innerHeight: 380, addEventListener: (name, callback) => listeners.set(name, callback), removeEventListener: name => listeners.delete(name) };
const install = vm.runInNewContext(fs.readFileSync('android/app/src/main/assets/player-ui.js', 'utf8'), {
    MutationObserver: class { constructor(callback) { mutations = callback; } observe() {} disconnect() {} },
    ResizeObserver: class { constructor(callback) { resized = callback; } observe() {} disconnect() {} },
});
const dispose = install(document, window, message => sent.push(message));
assert.equal(button.childNodes[0].textContent, 'Back');
assert.equal(attributes.get('aria-label'), 'Back to browsing');
assert.equal(sent[0].type, 'player-layout');
assert.equal(sent[0].top, 240);
assert.equal(sent[0].viewportWidth, 850);
resized();
assert.equal(sent.length, 1, 'Unchanged layout is not sent repeatedly');
const reads = measured;
for (let i = 0; i < 120; i++) mutations([{ addedNodes: [{ nodeType: 3 }], removedNodes: [] }]);
assert.equal(measured, reads, 'Time updates do not force layout measurements');
top = 200; resized();
assert.equal(sent.length, 2, 'A wrapped title updates the actual control exclusion band');
assert.equal(sent.at(-1).top, 200);
mounted = false; mutations([{ addedNodes: [], removedNodes: [{ nodeType: 1 }] }]);
resized(); assert.equal(sent.length, 2, 'Unmounted controls cannot publish stale geometry');
dispose(); assert.equal(listeners.size, 0);
console.log('PASS: hosted Back label, player typography markers, size-only geometry updates, progress isolation, and teardown');
