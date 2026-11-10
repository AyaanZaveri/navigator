const assert = require('node:assert/strict');
const { load, hooks } = require('./test-support/react-hooks.cjs');
const host = hooks();
const { PlayerSkipTimeline } = load('components/player-skip-timeline.tsx', { 'react/jsx-runtime': host.jsx });
const segments = [
    { kind: 'recap', start: 0, end: 30 },
    { kind: 'intro', start: 60, end: 120 },
    { kind: 'credits', start: 570, end: 600 },
];
let ranges = PlayerSkipTimeline({ segments, start: 0, end: 600 }).props.children.filter(Boolean);
assert.equal(ranges.length, 3);
assert.equal(ranges[1].props['data-kind'], 'intro');
assert.equal(ranges[1].props.style.left, '10%');
assert.equal(ranges[1].props.style.width, '10%');
for (const range of ranges) {
    assert.equal(range.props['aria-hidden'], 'true');
    assert.match(range.props.className, /pointer-events-none/);
    assert.match(range.props.className, /bg-white\/20/);
}
ranges = PlayerSkipTimeline({ segments, start: 90, end: 590 }).props.children.filter(Boolean);
assert.equal(ranges.length, 2);
assert.equal(ranges[0].props.style.left, '0%');
assert.equal(ranges[0].props.style.width, '6%');
assert.equal(ranges[1].props.style.width, '4%');
assert.equal(PlayerSkipTimeline({ segments, start: 0, end: 0 }), null);
assert.equal(PlayerSkipTimeline({ segments, start: 0, end: Infinity }), null);
assert.equal(PlayerSkipTimeline({ segments: [{ kind: 'intro', start: NaN, end: 2 }, { kind: 'credits', start: 30, end: 10 }], start: 0, end: 100 }).props.children.filter(Boolean).length, 0);
console.log('PASS: intro/recap/credits timeline ranges, light neutral treatment, partial seek-window clipping, invalid boundaries, and pointer passthrough');
