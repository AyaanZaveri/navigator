const assert = require('node:assert/strict');
const { load, hooks } = require('./test-support/react-hooks.cjs');
let now = 0, serial = 0;
const timers = new Map(), calls = [];
const document = { hidden: false }, navigator = { onLine: true, connection: { saveData: false, effectiveType: '4g' } };
const policy = load('lib/route-prefetch.ts', {}, { document, navigator });
const scheduler = policy.createRoutePrefetchScheduler({ allowed: policy.routePrefetchAllowed, now: () => now,
    later: (run, delay) => { const id = ++serial; timers.set(id, { run, at: now + delay }); return id; },
    cancel: id => timers.delete(id),
});
function advance(time) {
    for (;;) {
        const next = [...timers].filter(([, task]) => task.at <= time).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        now = next[1].at; timers.delete(next[0]); next[1].run();
    }
    now = time;
}
const schedule = href => scheduler(href, () => calls.push({ href, at: now }));
const brief = schedule('/movie/brief'); advance(119); brief(); advance(120);
assert.equal(calls.length, 0, 'Passing the pointer across cards must not prefetch');
schedule('/movie/one'); schedule('/movie/two'); schedule('/movie/one');
advance(240); assert.deepEqual(calls.map(call => call.href), ['/movie/one']);
advance(740); assert.deepEqual(calls.map(call => call.href), ['/movie/one', '/movie/two']);
assert.equal(calls[1].at - calls[0].at, 500, 'Shared launch budget is at most two starts per second');
schedule('/movie/one'); advance(900); assert.equal(calls.length, 2, 'Duplicate destination links reuse recent warmups');
schedule('/movie/hidden'); document.hidden = true; advance(1100); assert.equal(calls.length, 2);
document.hidden = false;
for (const field of ['saveData', 'offline', 'slow']) {
    navigator.connection.saveData = field === 'saveData'; navigator.onLine = field !== 'offline'; navigator.connection.effectiveType = field === 'slow' ? '2g' : '4g';
    assert.equal(policy.routePrefetchAllowed(), false); schedule(`/movie/${field}`);
}
navigator.connection.saveData = false; navigator.onLine = true; navigator.connection.effectiveType = '4g';
schedule('https://other.test'); schedule('//other.test'); schedule('/api/navigator/title?id=private'); advance(1500); assert.equal(calls.length, 2);
advance(31_000); schedule('/movie/one'); advance(31_120); assert.equal(calls.length, 3, 'Recent warmup entries expire');

const host = hooks();
const { IntentLink } = load('components/intent-link.tsx', {
    react: host.react, 'react/jsx-runtime': host.jsx, 'next/link': 'a',
    '@/lib/route-prefetch': { scheduleRoutePrefetch: scheduler },
});
const render = (href = '/series/keyboard') => host.render(IntentLink, { href, children: 'Title', scroll: false });
let link = render(); host.flush();
assert.equal(link.props.prefetch, false, 'Mounting/viewport visibility never forces full route work');
assert.equal(link.props.scroll, false);
const mouse = { pointerType: 'mouse', currentTarget: { matches: () => false } };
link.props.onPointerEnter(mouse); advance(31_150); link.props.onPointerLeave(mouse); advance(31_500);
assert.equal(render().props.prefetch, false);
const keyboard = { currentTarget: { matches: () => true } };
render().props.onFocus(keyboard); advance(31_620);
assert.equal(render().props.prefetch, true, 'Stable keyboard intent warms the actual Next Link');
render().props.onPointerLeave(keyboard);
assert.equal(render().props.prefetch, true, 'Pointer departure does not cancel keyboard focus');
render().props.onBlur(keyboard); assert.equal(render().props.prefetch, false);
link = render('/series/unmounted'); host.flush(); link.props.onPointerEnter(mouse); host.unmount();
const updates = host.updates; advance(40_000);
assert.equal(host.updates, updates, 'Unmount cancels outstanding dwell/queued work');
console.log('PASS: intent-only links, keyboard focus, dwell cancellation, launch budget, cross-link dedupe, expiry, network/visibility guards and unmount cleanup');
