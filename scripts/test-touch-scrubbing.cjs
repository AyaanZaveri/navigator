const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/media/touch-scrubbing.ts', 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, context);
const { attachTouchScrubbing } = context.exports;
function fixture() {
    const handlers = new Map();
    const captures = new Set();
    const root = {
        addEventListener: (type, fn) => handlers.set(type, fn),
        removeEventListener: type => handlers.delete(type),
        setPointerCapture: id => captures.add(id),
        hasPointerCapture: id => captures.has(id),
        releasePointerCapture: id => captures.delete(id),
    };
    const blank = { closest: () => null };
    const bar = { closest: () => null };
    const button = { closest: () => ({}) };
    const previews = [], commits = [];
    let cancels = 0, grabs = 0;
    const dispose = attachTouchScrubbing(root, {
        timeline: { contains: target => target === bar, getBoundingClientRect: () => ({ left: 20, width: 400 }) },
        start: 100, end: 1100, currentTime: () => 500, enabled: () => true,
        preview: (time, speed) => previews.push({ time, speed }), commit: time => commits.push(time), cancel: () => cancels++, grab: () => grabs++,
    });
    const send = (type, x, y, target = blank, extra = {}) => {
        const event = { type, clientX: x, clientY: y, target, pointerType: 'touch', pointerId: 1, isPrimary: true,
            prevented: false, preventDefault() { this.prevented = true; }, stopPropagation() {}, ...extra };
        handlers.get(type)?.(event);
        return event;
    };
    return { send, previews, commits, bar, button, dispose, handlers, get cancels() { return cancels; }, get grabs() { return grabs; } };
}
for (const y of [20, 200, 600]) {
    const f = fixture();
    f.send('pointerdown', 200, y);
    f.send('pointermove', 240, y);
    assert.equal(f.previews.at(-1).time, 600, 'Off-bar drags seek relative to playback at every vertical starting point');
    f.send('pointermove', 280, y + 140);
    assert.equal(f.previews.at(-1).time, 610, 'Moving away vertically enables fine scrubbing');
    f.send('pointermove', 280, y);
    assert.equal(f.previews.at(-1).time, 610, 'Changing speed without horizontal movement must not jump');
    f.send('pointermove', 320, y);
    assert.equal(f.previews.at(-1).time, 710, 'Returning to the starting height restores fast scrubbing');
    f.send('pointerup', 320, y);
    assert.deepEqual(f.commits, [710]);
    assert.equal(f.send('click', 320, y).prevented, true, 'Scrubbing must not also toggle playback');
    f.dispose();
    assert.equal(f.handlers.size, 0);
}
const bar = fixture();
bar.send('pointerdown', 220, 600, bar.bar);
assert.equal(bar.previews.at(-1).time, 600, 'Direct bar touch selects the touched timeline position');
bar.send('pointermove', 260, 740);
assert.equal(bar.previews.at(-1).time, 700, 'Bar drags remain absolute and follow the finger even after large vertical movement');
assert.equal(bar.previews.at(-1).speed, 1, 'Fine scrubbing is reserved for off-bar gestures');
assert.equal(bar.grabs, 1, 'A bar grab emits one feedback tick, never a tick on every move');
bar.send('pointermove', 1000, 600);
assert.equal(bar.previews.at(-1).time, 1100);
bar.send('pointermove', -1000, 600);
assert.equal(bar.previews.at(-1).time, 100);
bar.send('pointercancel', -1000, 600);
assert.equal(bar.cancels, 1);
assert.equal(bar.commits.length, 0);
const tap = fixture();
tap.send('pointerdown', 200, 200); tap.send('pointerup', 201, 200);
assert.equal(tap.previews.length, 0);
assert.equal(tap.send('click', 201, 200).prevented, false, 'An ordinary tap retains its existing behavior');
tap.send('pointerdown', 200, 200, tap.button); tap.send('pointermove', 300, 200, tap.button);
assert.equal(tap.previews.length, 0, 'Playback controls retain their own gestures');
const mouse = fixture();
mouse.send('pointerdown', 200, 200, mouse.bar, { pointerType: 'mouse' });
assert.equal(mouse.previews.length, 0, 'Mouse handling stays with the existing slider');
console.log('PASS: touch seeking anywhere, direct timeline seeking, fast/fine speed, clamping, cancellation, click suppression, and cleanup');
const secondFinger = fixture();
secondFinger.send('pointerdown', 220, 600, secondFinger.bar);
secondFinger.send('pointerdown', 250, 400, undefined, { pointerId: 2, isPrimary: false });
secondFinger.send('pointerup', 220, 600);
assert.equal(secondFinger.cancels, 1, 'A second finger cancels the active preview');
assert.equal(secondFinger.commits.length, 0, 'Multi-touch must not commit an accidental seek');
const lostCapture = fixture();
lostCapture.send('pointerdown', 220, 600, lostCapture.bar);
lostCapture.send('lostpointercapture', 220, 600);
assert.equal(lostCapture.cancels, 1, 'Losing capture restores playback progress');
assert.equal(lostCapture.commits.length, 0);

const release = fixture();
release.send('pointerdown', 220, 600, release.bar);
release.send('pointerup', 260, 740, release.bar);
assert.deepEqual(release.commits, [700], 'The release coordinate is committed even when a final move was coalesced');
