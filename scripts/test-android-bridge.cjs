const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const origin = 'https://navigator.test';
const script = fs.readFileSync('android/app/src/main/assets/bridge.js', 'utf8')
    .replace('__ORIGIN__', JSON.stringify(origin))
    .replace('__EDGE_CSS__', JSON.stringify(fs.readFileSync('android/app/src/main/assets/edge-to-edge.css', 'utf8')));
function setup({ foreign = false, iframe = false, delayedRoot = false } = {}) {
    const sent = [];
    const callbacks = {};
    const observers = [];
    const document = new EventTarget();
    let visible = false;
    const properties = new Map();
    const styles = [];
    const root = { dataset: { theme: 'dark' }, classList: { contains: () => false }, style: { setProperty(key, value) { properties.set(key, value); } }, hasAttribute: () => visible };
    document.createElement = () => ({ textContent: '' });
    document.head = { appendChild(node) { styles.push(node); } };
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
    return { window, document, root, properties, styles, sent, callbacks, observers, closed: () => closed,
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
app.receive({ type: 'insets', top: 28, right: 0, bottom: 16, left: 0 });
assert.equal(app.properties.get('--navigator-safe-top'), '28px', 'Native status-bar space reaches the page without shrinking the WebView');
assert.equal(app.properties.get('--navigator-safe-bottom'), '16px');
app.receive({ type: 'insets', top: 0, right: 0, bottom: 0, left: 32 });
assert.equal(app.properties.get('--navigator-safe-top'), '0px', 'Immersive landscape clears the old portrait status inset');
assert.equal(app.properties.get('--navigator-safe-left'), '32px', 'Landscape cutouts still protect controls');
const early = setup({ delayedRoot: true });
early.receive({ type: 'insets', top: 26, right: 0, bottom: 14, left: 0 });
early.document.documentElement = early.root;
early.observers[0].callback();
assert.equal(early.properties.get('--navigator-safe-top'), '26px', 'Insets received before HTML exists survive first paint');
assert.equal(app.styles.length, 1, 'Safe-area rules are installed once in the document head');
const theme = setup();
theme.root.dataset.theme = 'light';
theme.observers.forEach(observer => observer.callback());
assert.equal(theme.sent.at(-1).type, 'appearance');
assert.equal(theme.sent.at(-1).dark, false, 'Light pages request dark system icons');
theme.root.dataset.theme = 'dark';
theme.observers.forEach(observer => observer.callback());
assert.equal(theme.sent.at(-1).dark, true, 'Dark pages request light system icons');
console.log('PASS: Android bridge, origin/frame isolation, native events, safe areas, theme appearance, teardown, and deployed-client compatibility');
