const assert = require('node:assert/strict');
const { load } = require('./test-support/react-hooks.cjs');
const { createKeyboardScrubber, KEYBOARD_HOLD_MS, KEYBOARD_SCRUB_RATE } = load('lib/media/keyboard-scrubbing.ts');
function fixture({ paused = false, reduced = false, start = 8, rangeStart = 0 } = {}) {
    let now = 0, id = 0;
    const timers = new Map(), frames = new Map(), seeks = [], previews = [], paints = [];
    const media = { currentTime: start, duration: 120, paused, currentSrc: 'first.mkv',
        seekable: { length: 1, start: () => rangeStart, end: () => 120 } };
    let pauses = 0, plays = 0;
    const scrub = createKeyboardScrubber({
        media: () => media,
        seek(time) { seeks.push(time); media.currentTime = time; },
        pause() { pauses++; media.paused = true; },
        play() { plays++; media.paused = false; },
        preview: time => previews.push(time), reducedMotion: () => reduced,
    }, {
        now: () => now,
        set(fn, ms) { timers.set(++id, { fn, at: now + ms }); return id; }, clear(id) { timers.delete(id); },
        frame(fn) { frames.set(++id, fn); return id; }, cancelFrame(id) { frames.delete(id); },
    });
    scrub.subscribe(time => paints.push(time));
    const step = ms => {
        now += ms;
        for (const [key, timer] of [...timers]) if (timer.at <= now) { timers.delete(key); timer.fn(); }
        const pending = [...frames]; frames.clear(); pending.forEach(([, fn]) => fn());
    };
    return { scrub, media, seeks, previews, paints, step, get pauses() { return pauses; }, get plays() { return plays; },
        get pending() { return timers.size + frames.size; },
        run(ms) { for (let n = 0; n < ms; n += 10) step(Math.min(10, ms - n)); } };
}
const tap = fixture();
tap.scrub.press('arrowright'); tap.run(KEYBOARD_HOLD_MS - 1); tap.scrub.release('arrowright');
assert.deepEqual(tap.seeks, [13]); assert.equal(tap.pauses, 0); assert.equal(tap.paints.length, 0); assert.equal(tap.pending, 0);
const reverseTap = fixture(); reverseTap.scrub.press('arrowright'); reverseTap.scrub.press('arrowleft'); reverseTap.scrub.release('arrowleft');
assert.deepEqual(reverseTap.seeks, [13, 8], 'Opposite taps remain immediate before hold mode starts');
const vertical = fixture(); vertical.scrub.press('arrowup'); vertical.run(400); vertical.scrub.release('arrowup');
assert.equal(vertical.pending, 0, 'Focused timeline vertical arrows finish on their matching key release');
for (const paused of [false, true]) {
    const f = fixture({ paused });
    f.scrub.press('arrowright'); f.run(KEYBOARD_HOLD_MS);
    assert.equal(f.pauses, paused ? 0 : 1);
    const first = f.paints.at(-1);
    for (let n = 0; n < 100; n++) { f.scrub.press('arrowright', true); f.step(10); }
    assert.ok(Math.abs(f.paints.at(-1) - first - KEYBOARD_SCRUB_RATE) < 1e-8, 'Holding is linear and independent of key repeat frequency');
    assert.deepEqual(f.seeks, [13], 'The decoder must not seek on every repeat or animation frame');
    assert.ok(f.previews.length <= 12, 'Clock and thumbnail work is limited to 10Hz');
    assert.ok(f.paints.length >= 100, 'The visual target receives every display frame');
    const forward = f.paints.at(-1);
    f.scrub.press('arrowleft'); f.run(100);
    assert.ok(f.paints.at(-1) < forward, 'Reversing a hold responds immediately without easing');
    f.scrub.release('arrowright'); assert.equal(f.seeks.length, 1, 'The old direction key cannot finish the newer hold');
    f.scrub.release('arrowleft');
    assert.equal(f.seeks.length, 2); assert.equal(f.plays, paused ? 0 : 1); assert.equal(f.media.paused, paused);
    assert.equal(f.previews.at(-1), null); assert.equal(f.paints.at(-1), null); assert.equal(f.pending, 0);
}
const reduced = fixture({ reduced: true }); reduced.scrub.press('arrowright'); reduced.run(1300); reduced.scrub.release('arrowright');
assert.ok(reduced.paints.length <= 13, 'Reduced motion uses bounded stepped feedback');
assert.ok(Math.abs(reduced.seeks.at(-1) - 33) < 1e-8, 'Reduced motion keeps the same seek distance and final position');
for (const [start, key, expected] of [[118, 'arrowright', 120], [12, 'arrowleft', 10]]) {
    const f = fixture({ start, rangeStart: 10 }); f.scrub.press(key); f.run(1500); f.scrub.release(key);
    assert.equal(f.seeks.at(-1), expected, 'Targets stay inside the actual seekable range');
}
for (const action of ['cancel', 'dispose', 'source']) {
    const f = fixture(); f.scrub.press('arrowright'); f.run(500);
    if (action === 'source') { f.media.currentSrc = 'replacement.mkv'; f.step(10); }
    else f.scrub[action]();
    assert.equal(f.seeks.length, 1, `${action}: no stale preview is committed`);
    assert.equal(f.pending, 0, `${action}: cancel timers and frames`);
    assert.equal(f.plays, action === 'cancel' ? 1 : 0, `${action}: never resume a replaced or closed player`);
    f.scrub.press('arrowright', true); assert.equal(f.seeks.length, 1, 'Stray repeat events cannot restart a cancelled hold');
}
const stall = fixture(); stall.scrub.press('arrowright'); stall.run(300); stall.step(10000);
assert.ok(stall.paints.at(-1) <= 15.001, 'A stalled frame cannot jump the target by minutes'); stall.scrub.dispose();
console.log('PASS: tap/hold threshold, linear display-frame scrubbing, bounded previews, one release seek, pause restoration, reversal, bounds, reduced motion and cancellation.');
