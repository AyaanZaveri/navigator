const assert = require('node:assert/strict');
const { load } = require('./test-support/react-hooks.cjs');
const { createHomePaletteScene, homePalette, HOME_COLORS, LIGHT_HOME_COLORS } = load('lib/home-palette.ts');
const { createGradientTransition, rgbToLab, labToRgb, homeWash } = load('lib/gradient-palette.ts', {}, { Float32Array });
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture() {
    let now = 0, next = 0;
    const timers = new Map(), requests = [];
    const clock = { now: () => now,
        set(fn, delay) { timers.set(++next, { fn, at: now + delay }); return next; },
        clear(id) { timers.delete(id); },
    };
    const scene = createHomePaletteScene((primary, fallback) => new Promise(resolve => requests.push({ primary, fallback, resolve })), clock);
    return { scene, requests,
        advance(time) {
            now = time;
            for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.fn(); }
        },
        get timers() { return timers.size; },
    };
}
const red = ['#ff0000', '#bb2200', '#880000'], blue = ['#0000ff', '#0033bb', '#000088'];
async function browserTimers() {
    // Native Window timers are receiver-sensitive. Node timers and our
    // injected test clock accept `clock.set(...)`, hiding this browser bug.
    let now = 0, next = 0;
    const timers = new Map();
    function checkReceiver(receiver) {
        if (receiver !== undefined && receiver !== null && receiver.globalThis !== receiver) throw new TypeError('Illegal invocation');
    }
    const browserSetTimeout = function(fn, delay) {
        'use strict'; checkReceiver(this);
        timers.set(++next, { fn, at: now + delay }); return next;
    };
    const browserClearTimeout = function(id) {
        'use strict'; checkReceiver(this); timers.delete(id);
    };
    const { createHomePaletteScene } = load('lib/home-palette.ts', {}, {
        performance: { now: () => now }, setTimeout: browserSetTimeout, clearTimeout: browserClearTimeout,
    });
    const scene = createHomePaletteScene(() => Promise.resolve(red));
    scene.registerInitial({ primary: 'backdrop' }); scene.start(); await tick();
    assert.equal(timers.size, 1, 'The default browser clock must schedule startup without borrowing Window timer methods');
    now = 1500;
    for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.fn(); }
    assert.equal(scene.getSnapshot().colors, red, 'Real browser timer semantics must allow the initial palette to publish');
    assert.doesNotThrow(() => scene.hover(Symbol('card'), { primary: 'poster' }), 'Hover intent must not throw Illegal invocation');
    assert.doesNotThrow(() => scene.stop(), 'Cleanup must call the browser clearTimeout with its proper receiver');
    assert.equal(timers.size, 0);
}
async function startup() {
    const f = fixture();
    f.scene.registerInitial({ primary: 'first-backdrop', fallback: 'first-poster' });
    assert.equal(f.requests.length, 0, 'Registration must not load before mount');
    f.scene.start();
    assert.equal(f.requests.length, 1);
    f.requests[0].resolve(red); await tick();
    f.advance(1499); assert.equal(f.scene.getSnapshot().colors, null);
    f.advance(1500); assert.equal(f.scene.getSnapshot().colors, red);
    assert.equal(f.scene.getSnapshot().duration, 1200);
    f.scene.stop(); assert.equal(f.timers, 0);

    const late = fixture(); late.scene.start(); late.advance(2100);
    late.scene.registerInitial({ primary: 'late' }); late.requests[0].resolve(blue); await tick();
    late.advance(2100); assert.equal(late.scene.getSnapshot().colors, blue, 'Late streamed data starts immediately after the opening hold');
    late.scene.stop();
    const empty = fixture(); empty.scene.start(); empty.advance(9000);
    assert.equal(empty.requests.length, 0); assert.equal(empty.scene.getSnapshot().colors, null);
    empty.scene.stop();
    const missing = fixture(); missing.scene.start(); missing.scene.registerInitial({ primary: 'initial' });
    missing.scene.focus(Symbol('missing-art'), {}); missing.requests[0].resolve(red); await tick(); missing.advance(2000);
    assert.equal(missing.scene.getSnapshot().colors, null, 'An explicit selection without artwork still cancels startup takeover');
    missing.scene.stop();
}
async function interaction() {
    const f = fixture(), a = Symbol('a'), b = Symbol('b');
    f.scene.start(); f.scene.registerInitial({ primary: 'initial' });
    f.scene.hover(a, { primary: 'a', fallback: 'poster' });
    f.advance(89); assert.equal(f.requests.length, 1, 'Brief pointer crossings do no work');
    f.scene.leave(a); f.advance(100); assert.equal(f.requests.length, 2, 'Leaving a brief hover rearms the opening via the shared request');
    f.scene.hover(a, { primary: 'a' }); f.advance(190);
    assert.equal(f.requests.at(-1).primary, 'a');
    const requestA = f.requests.at(-1);
    f.scene.hover(b, { primary: 'b' }); f.advance(280);
    const requestB = f.requests.at(-1);
    requestB.resolve(blue); await tick();
    assert.equal(f.scene.getSnapshot().colors, blue); assert.equal(f.scene.getSnapshot().duration, 280);
    requestA.resolve(red); f.requests[0].resolve(red); await tick(); f.advance(4000);
    assert.equal(f.scene.getSnapshot().colors, blue, 'Slow hover and startup requests cannot reverse the newest selection');
    f.scene.leave(b); assert.equal(f.scene.getSnapshot().colors, blue, 'Hover exit retains the last palette');
    f.scene.focus(a, { primary: 'a' }); f.requests.at(-1).resolve(red); await tick();
    assert.equal(f.scene.getSnapshot().duration, 0, 'Keyboard focus updates immediately');
    f.scene.focus(b, { primary: 'b' }); f.scene.release(b); f.requests.at(-1).resolve(blue); await tick();
    assert.equal(f.scene.getSnapshot().colors, red, 'A removed virtualized card cannot publish late');
    f.scene.focus(a, { primary: 'broken' }); f.requests.at(-1).resolve(null); await tick();
    assert.equal(f.scene.getSnapshot().colors, red, 'Failures preserve the displayed palette');
    f.scene.focus(a, { primary: 'late' }); f.scene.stop(); f.requests.at(-1).resolve(blue); await tick();
    assert.equal(f.scene.getSnapshot().colors, red, 'Unmount invalidates requests');
    assert.equal(f.timers, 0);
}
async function replay() {
    const f = fixture(); f.scene.start(); const release = f.scene.registerInitial({ primary: 'first' });
    const obsolete = f.requests[0]; release(); f.scene.stop(); f.scene.start(); f.scene.registerInitial({ primary: 'first' });
    obsolete.resolve(red); f.requests.at(-1).resolve(blue); await tick(); f.advance(1500);
    assert.equal(f.scene.getSnapshot().colors, blue, 'Strict Mode replay only accepts the current registration');
    f.scene.stop();
}
function transitions() {
    const initial = new Float32Array(rgbToLab([1, 0, 0]));
    const target = new Float32Array(rgbToLab([0, 0, 1]));
    const track = createGradientTransition(initial), value = track.value;
    track.target(target, 0, 1200); const halfway = Array.from(track.sample(600));
    assert.ok(halfway.some((channel, i) => channel !== initial[i] && channel !== target[i]));
    track.target(initial, 600, 280); assert.deepEqual(Array.from(track.sample(600)), halfway, 'Retarget starts at displayed colors');
    assert.equal(track.sample(880), value, 'The uniform buffer is reused'); assert.equal(track.active, false);
    track.target(target, 900, 0); assert.deepEqual(Array.from(value), Array.from(target));
    track.target(initial, 1000, 280); track.finish(); assert.deepEqual(Array.from(value), Array.from(initial));
    assert.equal(track.active, false, 'Reduced motion settles the palette');
    for (const rgb of [[1, 0, 0], [0, 1, 0], [0, 0, 1], [.3, .4, .5]]) {
        labToRgb(rgbToLab(rgb)).forEach((channel, i) => assert.ok(Math.abs(channel - rgb[i]) < .00001));
    }
    assert.equal(homePalette(null, false), HOME_COLORS); assert.equal(homePalette(null, true), LIGHT_HOME_COLORS);
    const monochrome = homePalette(['#777777'], false);
    assert.equal(monochrome.length, 4);
    assert.ok(monochrome.every(color => color.slice(1, 3) === color.slice(3, 5) && color.slice(3, 5) === color.slice(5, 7)), 'Neutral artwork stays neutral');
    const ramp = new Float32Array(Array.from({ length: 4 }, () => rgbToLab([.8, .1, .2])).flat());
    for (const light of [true, false]) {
        const out = new Float32Array(6); assert.equal(homeWash(ramp, 4, light, out), out);
        assert.ok(out.every(value => value >= 0 && value <= 1));
    }
}
(async () => {
    await browserTimers(); await startup(); await interaction(); await replay(); transitions();
    console.log('PASS: emerald hold, streamed startup, empty history, hover intent/exit, focus, stale-result ownership, removal/replay cleanup and interruptible OKLab transitions.');
})().catch(error => { console.error(error); process.exitCode = 1; });
