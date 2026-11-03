const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const origin = 'https://navigator.test';
const script = fs.readFileSync('android/app/src/main/assets/bridge.js', 'utf8')
    .replace('__ORIGIN__', JSON.stringify(origin))
    .replace('__WEB_SCRUB__', fs.readFileSync('android/app/src/main/assets/web-scrub.js', 'utf8'))
    .replace('__PLAYER_UI__', fs.readFileSync('android/app/src/main/assets/player-ui.js', 'utf8'))
    .replace('__BACK_NAVIGATION__', fs.readFileSync('android/app/src/main/assets/back-navigation.js', 'utf8'))
    .replace('__TOUCH_CONTROLS__', fs.readFileSync('android/app/src/main/assets/touch-controls.js', 'utf8'))
    .replace('__EDGE_CSS__', JSON.stringify(fs.readFileSync('android/app/src/main/assets/edge-to-edge.css', 'utf8')));
function setup({ foreign = false, iframe = false, delayedRoot = false, clock = {} } = {}) {
    const sent = [];
    const callbacks = {};
    const observers = [];
    const document = new EventTarget();
    let visible = false;
    const properties = new Map();
    const styles = [];
    const root = { dataset: { theme: 'dark' }, classList: { contains: () => false }, style: { setProperty(key, value) { properties.set(key, value); } }, hasAttribute: () => visible };
    document.querySelectorAll = () => [];
    document.getElementById = () => null;
    document.createElement = () => ({ textContent: '' });
    document.head = { appendChild(node) { styles.push(node); } };
    document.documentElement = delayedRoot ? null : root;
    let closed = 0;
    document.querySelector = selector => selector === '[data-native-player-shell]'
        ? { querySelector: name => name.startsWith('button') ? { click: () => closed++ } : null, querySelectorAll: () => [] }
        : selector.includes('data-slot="media-player"') ? null : { querySelector: () => ({ click: () => closed++ }) };
    const window = { NavigatorAndroid: { postMessage: value => sent.push(JSON.parse(value)) }, addEventListener: (type, callback) => { callbacks[type] = callback; }, removeEventListener: type => { delete callbacks[type]; } };
    window.top = iframe ? {} : window;
    const MutationObserver = class {
        constructor(callback) { this.callback = callback; observers.push(this); }
        observe() {}
        disconnect() {}
    };
    vm.runInNewContext(script, { window, document, location: { origin: foreign ? 'https://untrusted.test' : origin }, MutationObserver, ResizeObserver: class { observe() {} disconnect() {} }, Event, console, clearTimeout, setTimeout, ...clock });
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

// Exercise the shipped compatibility controller with an actual event/timer loop.
// No WebView, browser automation, emulator, network, or React runtime required.
function testTouchControls() {
    let now = 0, serial = 0, subscriber, observer, menu = false, updated = false;
    const timers = new Map();
    const handlers = new Map();
    const attrs = new Map();
    const controls = { inert: false, setAttribute: (key, value) => attrs.set(`controls:${key}`, value), removeAttribute: key => attrs.delete(`controls:${key}`) };
    const root = {
        setAttribute: (key, value) => attrs.set(key, value), removeAttribute: key => attrs.delete(key),
        querySelectorAll: () => [controls], contains: target => target.inside,
    };
    const document = {
        activeElement: null,
        querySelector: selector => selector.includes(':not(') ? (updated ? null : root) : (menu ? {} : null),
        addEventListener: (type, handler) => handlers.set(type, handler),
        removeEventListener: type => handlers.delete(type),
    };
    const install = vm.runInNewContext(fs.readFileSync('android/app/src/main/assets/touch-controls.js', 'utf8'), {
        setTimeout(callback, delay) { const id = ++serial; timers.set(id, { at: now + delay, callback }); return id; },
        clearTimeout(id) { timers.delete(id); },
        MutationObserver: class { constructor(callback) { observer = callback; } observe() {} disconnect() {} },
    });
    const dispose = install(document, { subscribe(fn) { subscriber = fn; return () => { subscriber = null; }; } });
    const advance = delay => {
        const end = now + delay;
        while (true) {
            const next = [...timers].filter(([, value]) => value.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
            if (!next) break;
            now = next[1].at;
            timers.delete(next[0]);
            next[1].callback();
        }
        now = end;
    };
    const state = (paused, session = 'video') => subscriber({ type: 'state', session, state: { paused, position: now / 1000 } });
    const ready = (session = 'video') => subscriber({ type: 'ready', session });
    const surface = { inside: true, closest: () => null };
    const button = { inside: true, closest: () => controls };
    const event = (type, target = surface, pointerType = 'touch', detail = 1) => {
        const value = { target, pointerType, detail, defaultPrevented: false, stopped: false,
            preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; } };
        handlers.get(type)(value);
        return value;
    };
    const visible = () => attrs.get('data-android-controls') === 'visible';
    state(false); ready();
    for (let i = 0; i < 11; i++) { advance(250); state(false); observer(); }
    assert.ok(visible(), 'Controls stay visible for the full three-second idle interval');
    advance(250);
    assert.ok(!visible(), 'Progress-driven React mutations and native state updates cannot cancel auto-hide');
    assert.ok(controls.inert, 'Hidden controls cannot receive focus or accidental taps');
    event('pointerdown');
    let tap = event('click');
    assert.ok(visible() && tap.defaultPrevented && tap.stopped, 'Touch reveals controls without reaching React play/pause');
    event('pointerdown'); tap = event('click');
    assert.ok(!visible() && tap.stopped, 'A second tap hides controls without pausing');
    event('pointerdown', surface, 'mouse');
    const mouse = event('click', surface, 'mouse');
    assert.ok(!mouse.defaultPrevented && !mouse.stopped, 'Mouse clicks keep the existing desktop play/pause action');
    event('pointerdown', surface, 'touch'); event('click');
    event('pointerdown', button);
    advance(6000);
    assert.ok(visible(), 'A held seek or volume slider keeps controls visible');
    event('pointerup', button); event('click', button);
    menu = true;
    advance(5000);
    assert.ok(visible(), 'Portalled track, cast, or settings menus keep controls visible');
    menu = false;
    advance(1000);
    assert.ok(!visible(), 'Idle detection resumes after a menu closes');
    state(true);
    advance(15000);
    assert.ok(visible(), 'Paused playback keeps controls visible');
    event('pointerdown', surface, 'touch', 0);
    const keyboard = event('click', surface, 'touch', 0);
    assert.ok(!keyboard.stopped, 'Keyboard and assistive click activation is not intercepted');
    state(false, 'next-video');
    advance(5000);
    assert.ok(visible(), 'A new stream holds controls until it is ready');
    ready('next-video');
    advance(3000);
    assert.ok(!visible(), 'The next stream also auto-hides');
    updated = true; observer();
    assert.ok(!attrs.has('data-android-controls') && !controls.inert, 'Updated React players take over without two visibility controllers');
    dispose();
    assert.equal(timers.size, 0, 'Unmount cancels every idle timer');
    assert.equal(handlers.size, 0, 'Page teardown removes all interaction listeners');
    assert.equal(subscriber, null, 'Page teardown unsubscribes native updates');
}
testTouchControls();
console.log('PASS: touch toggles, mouse/keyboard passthrough, progress-safe auto-hide, sliders, menus, pause, sessions, and cleanup');


// CSS overflow scrolls never change WebView.scrollY. Capture them in the
// document and send only activity edges, rather than IPC on every scroll frame.
function testScrollHints() {
    let now = 0, serial = 0;
    const timers = new Map();
    const clock = {
        setTimeout(callback, delay) { const id = ++serial; timers.set(id, { at: now + delay, callback }); return id; },
        clearTimeout(id) { timers.delete(id); },
    };
    const app = setup({ clock });
    const hints = () => app.sent.filter(message => message.type === 'scrolling');
    const advance = delay => {
        now += delay;
        for (const [id, timer] of [...timers]) {
            if (timer.at <= now) { timers.delete(id); timer.callback(); }
        }
    };
    assert.equal(hints().length, 0, 'Idle browsing never requests a high refresh rate');
    for (let i = 0; i < 120; i++) {
        app.document.dispatchEvent(new Event('scroll'));
        advance(8);
    }
    assert.equal(hints().length, 1, 'A 120 Hz scroll sends one start hint, not 120 IPC messages');
    assert.equal(hints()[0].value, true);
    advance(240);
    assert.equal(hints().length, 2, 'A completed fling releases its high-refresh preference');
    assert.equal(hints()[1].value, false);
    app.document.dispatchEvent(new Event('scroll'));
    app.document.hidden = true;
    app.document.dispatchEvent(new Event('visibilitychange'));
    assert.equal(hints().at(-1).value, false, 'Backgrounding releases a live hint before JS timers are throttled');
    app.document.hidden = false;
    app.document.dispatchEvent(new Event('scroll'));
    app.callbacks.pagehide();
    const count = hints().length;
    advance(5000);
    app.document.dispatchEvent(new Event('scroll'));
    assert.equal(hints().length, count, 'Page teardown removes the listener and outstanding idle timer');
}
testScrollHints();
console.log('PASS: nested-scroll refresh hints, 120 Hz message coalescing, idle release, backgrounding, and teardown');

app.receive({ type: 'insets', top: 0, right: 0, bottom: 24, left: 52,
    cornerBottomLeft: 48, cornerBottomRight: 50, playerBackLeft: 10 });
assert.equal(app.properties.get('--navigator-corner-bottom-left'), '48px');
assert.equal(app.properties.get('--navigator-corner-bottom-right'), '50px');
assert.equal(app.properties.get('--navigator-player-back-left'), '10px', 'Top Back position is independent of a mid-screen landscape cutout');
console.log('PASS: physical display corners and button-specific camera clearance reach CSS');

const activitySource = fs.readFileSync('android/app/src/main/java/app/navigator/android/MainActivity.kt','utf8');
const visibilityCase = activitySource.split('"visible" ->')[1].split('"seek-feedback" ->')[0];
assert.match(visibilityCase,/setFullscreen\(playerVisible\)/,'Landscape starts when the shell opens, before a stream is loaded');
assert.ok(!visibilityCase.includes('player.active()'),'Fetching streams must not delay orientation');

// The APK must protect older hosted UIs too: their visibility:hidden boundary
// can be overridden by loaded Continue Watching and hero wordmarks.
const edgeCss = require('postcss').parse(fs.readFileSync('android/app/src/main/assets/edge-to-edge.css', 'utf8'));
let isolatedPage;
edgeCss.walkRules(rule => {
    if (rule.selector.includes('html[data-native-engine="exoplayer"][data-native-playing] [data-desktop-app-content]')) isolatedPage = rule;
});
assert.ok(isolatedPage, 'Bundle retained-page isolation in the APK, independent of hosted deployment');
for (const [property, expected] of [['opacity', '0'], ['pointer-events', 'none']]) {
    const declaration = isolatedPage.nodes.find(node => node.prop === property);
    assert.equal(declaration.value, expected);
    assert.equal(declaration.important, true, 'Older hosted styles cannot override the APK paint boundary');
}
assert.ok(isolatedPage.selector.includes('[data-playback-hidden]'), 'Also honor the immediate React playback boundary');
assert.ok(!isolatedPage.nodes.some(node => node.prop === 'display'), 'Keep the retained page geometry intact');
console.log('PASS: APK-bundled page isolation covers old and current hosted UI contracts');
