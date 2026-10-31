const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const origin = 'https://navigator.test';
const script = fs.readFileSync('android/app/src/main/assets/bridge.js', 'utf8').replace('__ORIGIN__', JSON.stringify(origin));
function setup({ foreign = false, iframe = false, delayedRoot = false } = {}) {
    const sent = [];
    const callbacks = {};
    const observers = [];
    const document = new EventTarget();
    let visible = false;
    const root = { dataset: {}, style: { setProperty() {} }, hasAttribute: () => visible };
    document.documentElement = delayedRoot ? null : root;
    let closed = 0;
    document.querySelector = () => ({ querySelector: () => ({ click: () => closed++ }) });
    const window = { NavigatorAndroid: { postMessage: value => sent.push(JSON.parse(value)) }, addEventListener: (type, callback) => { callbacks[type] = callback; } };
    window.top = iframe ? {} : window;
    const MutationObserver = class {
        constructor(callback) { this.callback = callback; observers.push(this); }
        observe() {}
        disconnect() {}
    };
    vm.runInNewContext(script, { window, document, location: { origin: foreign ? 'https://untrusted.test' : origin }, MutationObserver, Event, console });
    return { window, document, root, sent, callbacks, observers, closed: () => closed,
        visible(value) { visible = value; observers.forEach(observer => observer.callback()); },
        receive(value) { window.NavigatorAndroid.onmessage({ data: JSON.stringify(value) }); } };
}

const app = setup();
const bridge = app.window.navigatorDesktop;
assert.equal(bridge.platform, 'android');
assert.equal(bridge.engine, 'exoplayer');
assert.equal(bridge.protocol, 1);
assert.ok(Object.isFrozen(bridge));
assert.equal(app.root.dataset.nativeEngine, 'exoplayer');
assert.ok(app.sent.some(message => message.type === 'hello'));
let received;
const unsubscribe = bridge.subscribe(message => { received = message; });
app.receive({ type: 'fullscreen', value: true });
assert.equal(bridge.fullscreen, true);
assert.equal(received.type, 'fullscreen');
unsubscribe();
app.receive({ type: 'fullscreen', value: false });
assert.equal(received.value, true);
app.visible(true);
assert.equal(app.sent.at(-1).type, 'visible');
assert.equal(app.sent.at(-1).value, true);
const count = app.sent.length;
app.visible(true);
assert.equal(app.sent.length, count, 'Repeated root mutations do not flood the native bridge');
bridge.send({ type: 'load', session: 'current', url: 'https://media.test/video.mkv' });
app.callbacks.pagehide();
assert.equal(app.sent.at(-2).type, 'stop');
assert.equal(app.sent.at(-2).session, 'current');
assert.equal(app.sent.at(-1).value, false);
let closeEvents = 0;
app.document.addEventListener('navigatornativeclose', event => { closeEvents++; event.preventDefault(); });
app.receive({ type: 'close' });
assert.equal(closeEvents, 1);
assert.equal(app.closed(), 0, 'Current React handler closes the player without legacy DOM fallback');
const legacy = setup();
legacy.receive({ type: 'close' });
assert.equal(legacy.closed(), 1, 'Already deployed React controls support Android Back before the PR merges');
legacy.window.navigatorDesktop.send({ type: 'load', session: 'old' });
legacy.window.navigatorDesktop.send({ type: 'stop', session: 'old' });
const stoppedCount = legacy.sent.length;
legacy.callbacks.pagehide();
assert.equal(legacy.sent.length, stoppedCount + 1, 'Page unload does not re-stop a disposed session');
assert.equal(setup({ foreign: true }).window.navigatorDesktop, undefined);
assert.equal(setup({ iframe: true }).window.navigatorDesktop, undefined);
const delayed = setup({ delayedRoot: true });
delayed.document.documentElement = delayed.root;
delayed.observers[0].callback();
assert.equal(delayed.root.dataset.nativeEngine, 'exoplayer', 'Transparency is installed before app hydration even when the root arrives later');
console.log('PASS: Android bridge, origin/frame isolation, native events, page teardown, and deployed-client compatibility');
