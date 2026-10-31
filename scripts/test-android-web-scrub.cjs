const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup({ manifest = false, updated = false } = {}) {
    let subscriber, mutation, timer = 0;
    const timers = new Map(), handlers = new Map(), events = [], requests = [], attrs = new Map();
    const properties = new Map(), children = [];
    const style = { setProperty(key, value) { properties.set(key, value); } };
    const node = () => ({ style, dataset: {}, setAttribute(key, value) { attrs.set(key, value); },
        removeAttribute(key) { attrs.delete(key); }, getAttribute(key) { return attrs.get(key); } });
    const root = node();
    const tooltip = { ...node(), getBoundingClientRect: () => ({ width: 224 }) };
    const caption = { parentElement: { parentElement: tooltip } };
    const thumbnail = { ...node(), dataset: updated ? { nativePreviewProvider: 'android' } : {},
        appendChild(child) { children.push(child); }, querySelectorAll: () => [] };
    const seek = { ...node(), isConnected: true, closest: () => root,
        contains: target => target === seek, getBoundingClientRect: () => ({ left: 24, top: 380, width: 952, height: 6 }),
        dispatchEvent(event) { events.push(event); return true; } };
    const controller = { previewSession: 'current', preview(at) { requests.push(at); return Promise.resolve('data:image/jpeg;base64,AA=='); }, cancelPreview() {} };
    const media = { controller, duration: 120, src: manifest ? 'https://video.test/file.m3u8?token=public' : 'https://video.test/file.mkv' };
    const document = {
        querySelector(selector) {
            if (selector === 'navigator-mpv') return media;
            if (selector.includes('seek-thumbnail')) return thumbnail;
            if (selector.includes('seek-time')) return caption;
            if (selector.includes('seek"')) return seek;
            return null;
        },
        createElement() { return { ...node(), remove() { const at = children.indexOf(this); if (at >= 0) children.splice(at, 1); } }; },
        addEventListener(type, handler) { handlers.set(type, handler); },
        removeEventListener(type) { handlers.delete(type); },
    };
    const window = { innerWidth: 1000, PointerEvent: class { constructor(type, init) { this.type = type; Object.assign(this, init); } } };
    const install = vm.runInNewContext(fs.readFileSync('android/app/src/main/assets/web-scrub.js', 'utf8'), {
        MutationObserver: class { constructor(callback) { mutation = callback; } observe() {} disconnect() {} },
        setTimeout(callback) { timers.set(++timer, callback); return timer; }, clearTimeout(id) { timers.delete(id); },
    });
    const api = install(document, window, { subscribe(fn) { subscriber = fn; return () => { subscriber = null; }; } });
    return { api, events, requests, attrs, properties, children, controller, seek, document, handlers, thumbnail, timers,
        move(values = {}) { subscriber({ type: 'scrub', active: true, session: 'current', position: 30, duration: 120, x: 900, ...values }); },
        receive(message) { subscriber(message); }, mutate() { mutation(); },
        flush() { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); },
    };
}

async function test() {
    const app = setup();
    app.move();
    assert.deepEqual(app.events.map(event => event.type), ['pointerover', 'pointermove'], 'Whole-screen gestures drive the existing web seek component');
    assert.equal(app.events[1].clientX, 262, 'Preview time maps through the actual timeline, independently of thumb position');
    assert.equal(app.events[1].pointerType, 'touch', 'Synthetic movement does not activate mouse auto-show or pause playback');
    assert.equal(app.properties.get('--navigator-native-scrub-x'), '880px', 'Tooltip follows the thumb and stays within the viewport');
    assert.equal(app.properties.get('--navigator-native-scrub-right'), '75%');
    app.move({ position: 60, x: 500 });
    assert.equal(app.events.at(-1).clientX, 500);
    assert.equal(app.properties.get('--navigator-native-scrub-x'), '500px');
    app.flush();
    assert.equal(app.requests.length, 0, 'Ordinary streams keep their existing React preview provider');
    app.receive({ type: 'scrub', active: false, session: 'stale' });
    assert.ok(app.attrs.has('data-native-web-scrub'), 'A stale session cannot dismiss the current gesture');
    app.receive({ type: 'scrub', active: false, session: 'current' });
    assert.equal(app.events.at(-1).type, 'pointerout');
    assert.ok(!app.attrs.has('data-native-web-scrub'));
    assert.ok(!app.attrs.has('data-native-scrub-tooltip'));
    const count = app.events.length;
    app.move({ session: 'old' });
    assert.equal(app.events.length, count, 'Old source events cannot request a preview on a new video');
    app.move({ position: NaN });
    assert.equal(app.events.length, count, 'Invalid gesture coordinates cannot reach the web seek component');
    app.move(); app.seek.isConnected = false; app.mutate();
    assert.ok(!app.attrs.has('data-native-web-scrub'), 'Unmounting the player clears native gesture overrides');
    app.api.dispose();
    assert.equal(app.handlers.size, 0);
    assert.equal(app.timers.size, 0);

    const legacy = setup({ manifest: true });
    legacy.move(); legacy.flush(); await Promise.resolve();
    assert.deepEqual(legacy.requests, [30], 'Deployed HLS clients receive native frames through the controller preview API');
    assert.equal(legacy.children.length, 1, 'A frame renders inside the existing HTML thumbnail');
    assert.equal(legacy.children[0].src, 'data:image/jpeg;base64,AA==');
    legacy.move({ position: 33 }); legacy.flush();
    legacy.receive({ type: 'thumbnail-frame', session: 'old', position: 30, src: 'data:image/jpeg;base64,OLD' });
    assert.notEqual(legacy.children[0].src, 'data:image/jpeg;base64,OLD');
    legacy.receive({ type: 'thumbnail-frame', session: 'current', position: 30, src: 'data:image/jpeg;base64,LAST' });
    assert.equal(legacy.children[0].src, 'data:image/jpeg;base64,LAST', 'Last completed frame stays visible while a newer request decodes');
    legacy.receive({ type: 'scrub', active: false, session: 'current' });
    await Promise.resolve();
    assert.equal(legacy.children.length, 0, 'Pending frames cannot recreate a dismissed preview');
    legacy.api.dispose();

    const modern = setup({ manifest: true, updated: true });
    modern.move(); modern.flush();
    assert.equal(modern.requests.length, 0, 'Updated React HLS provider owns extraction without a competing compatibility request');
    assert.equal(modern.children.length, 0);
    modern.document.hidden = true; modern.handlers.get('visibilitychange')();
    assert.ok(!modern.attrs.has('data-native-web-scrub'), 'Backgrounding clears preview and timeline overrides');
    modern.api.dispose();
    console.log('PASS: native gestures reuse web seek UI, thumb/time synchronization, HLS compatibility, streamed frames, session isolation, and cleanup');
}
test().catch(error => { console.error(error); process.exitCode = 1; });
