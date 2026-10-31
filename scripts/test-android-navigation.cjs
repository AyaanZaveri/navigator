const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

let changed, scans = 0, current = null, expanded = false;
const sent = [];
const document = new EventTarget();
document.documentElement = new EventTarget();
document.querySelectorAll = () => { scans++; return current ? [current] : []; };
document.getElementById = id => id === 'avatar' ? { getAttribute: () => expanded ? 'true' : 'false' } : null;
class Node extends EventTarget {
    constructor(ask = false) { super(); this.ask = ask; this.nodeType = 1; this.inert = false; }
    getAttribute(name) { return name === 'aria-labelledby' && !this.ask ? 'avatar' : null; }
    getClientRects() { return [{}]; }
    matches(selector) { return selector.startsWith('section[') ? this.ask : true; }
}
class KeyboardEvent extends Event {
    constructor(type, options) { super(type, options); this.key = options.key; }
}
class PointerEvent extends Event {
    constructor(type, options) { super(type, options); this.button = options.button; }
}
const window = new EventTarget();
window.KeyboardEvent = KeyboardEvent;
window.PointerEvent = PointerEvent;
const initialState = { __NA: true, tree: ['root'] };
const entries = [{ state: initialState, url: '/' }];
let index = 0;
window.history = {
    pushState(state, title, url) { assert.equal(this, window.history); entries.splice(index + 1); entries.push({ state, url }); index++; return undefined; },
    replaceState(state, title, url) { assert.equal(this, window.history); entries[index] = { state, url }; },
};
const push = window.history.pushState;
const replace = window.history.replaceState;
const install = vm.runInNewContext(fs.readFileSync('android/app/src/main/assets/back-navigation.js', 'utf8'), {
    Event, Reflect, Map,
    MutationObserver: class { constructor(callback) { changed = callback; } observe() {} disconnect() {} },
});
const navigation = install(document, window, value => sent.push(value));
assert.equal(sent.at(-1).overlayOpen, false);
const nextState = { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: ['movie', 'example'] };
window.history.pushState(nextState, '', '/movie/example');
assert.equal(index, 1);
assert.equal(entries[index].state, nextState, 'Next.js history state is preserved verbatim');
assert.equal(sent.length, 2, 'SPA pushState notifies Android before the next gesture');
window.history.replaceState(nextState, '', '/movie/example?tab=streams');
assert.equal(index, 1, 'Notifications never create fake history entries');
assert.equal(entries[index].state, nextState);
index--;
window.dispatchEvent(new Event('popstate'));
assert.equal(sent.length, 4, 'Back/forward traversal also refreshes the native callback');
assert.equal(entries[index].state, initialState);

const beforeText = scans;
for (let i = 0; i < 120; i++) changed([{ type: 'childList', addedNodes: [{ nodeType: 3 }], removedNodes: [] }]);
assert.equal(scans, beforeText, 'Playback/transcript text updates do not trigger global overlay scans');
changed([{ type: 'childList', addedNodes: [{ nodeType: 1, matches: () => false, querySelector: () => null }], removedNodes: [] }]);
assert.equal(scans, beforeText, 'Ordinary catalog updates do not trigger overlay scans');

expanded = true;
const menu = current = new Node();
changed([{ type: 'childList', addedNodes: [menu], removedNodes: [] }]);
assert.equal(sent.at(-1).overlayOpen, true, 'A portalled menu enables Android Back even at the root');
let escapes = 0;
menu.addEventListener('keydown', event => {
    assert.equal(event.key, 'Escape'); escapes++;
    expanded = false;
    changed([{ type: 'attributes' }]);
});
navigation.dismiss();
assert.equal(escapes, 1);
assert.equal(index, 0, 'Dismissing a menu cannot traverse page history');
assert.equal(sent.at(-1).overlayOpen, false, 'An exiting menu no longer intercepts Back');

current = new Node(true);
changed([{ type: 'childList', addedNodes: [current], removedNodes: [] }]);
let askClosed = 0, outside = 0;
const closeAsk = event => { event.preventDefault(); askClosed++; };
document.addEventListener('navigatornativeback', closeAsk);
document.documentElement.addEventListener('pointerdown', () => outside++);
navigation.dismiss();
assert.equal(askClosed, 1, 'Current React Ask panel receives its cancelable dismiss event');
assert.equal(outside, 0);
document.removeEventListener('navigatornativeback', closeAsk);
navigation.dismiss();
assert.equal(outside, 1, 'The already hosted Ask panel uses its existing outside-press handler');

navigation.dispose();
assert.equal(window.history.pushState, push);
assert.equal(window.history.replaceState, replace);
const last = sent.length;
window.dispatchEvent(new Event('popstate'));
changed([{ type: 'attributes' }]);
assert.equal(sent.length, last, 'Disposed documents cannot publish stale navigation state');
console.log('PASS: Next.js history preservation, SPA back state, overlay dismissal, hosted Ask compatibility, scan coalescing, and teardown');
