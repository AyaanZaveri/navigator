const assert = require('node:assert/strict');
const { load } = require('./test-support/react-hooks.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const timers = new Map(); let timerId = 0;
const api = load('lib/media/continue-watching-warmup.ts', {}, {
    setTimeout: fn => { const id = ++timerId; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id),
});
const { createContinueWatchingScheduler } = load('lib/media/continue-watching-scheduler.ts');
const item = id => ({ id, type: 'movie' });
function fixture(ids = ['a', 'b', 'c', 'd', 'e']) {
    const calls = [];
    let visible = ids.map(item), allowed = true;
    const owner = api.createContinueWatchingWarmup((id, type, signal) => {
        let resolve, reject;
        const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
        signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true });
        const request = { id, type, promise, canonicalId: Promise.resolve(id), snapshot: { complete: false, streams: [] } };
        calls.push({ id, signal, request, finish: () => resolve([{ url: 'https://video.test/' + id }]) }); return request;
    }, () => 0);
    const scheduler = createContinueWatchingScheduler(owner, { candidates: () => visible, allowed: () => allowed });
    return { calls, scheduler, owner, visible: ids => { visible = ids.map(item); }, allowed: value => { allowed = value; } };
}
(async () => {
    const first = fixture();
    first.scheduler.refresh();
    assert.deepEqual(first.calls.map(call => call.id), ['a', 'b'], 'Two visible discoveries begin together');
    first.calls[0].finish(); await tick();
    assert.deepEqual(first.calls.map(call => call.id), ['a', 'b', 'c'], 'A free slot starts the next visible title');
    first.calls[1].finish(); await tick();
    assert.deepEqual(first.calls.map(call => call.id), ['a', 'b', 'c', 'd']);
    first.calls[2].finish(); first.calls[3].finish(); await tick(); first.scheduler.refresh();
    assert.equal(first.calls.length, 4, 'The fifth visible card and settled cards do not create automatic requests');
    assert.equal(first.scheduler.claim(item('a')), first.calls[0].request, 'All four completed requests remain available for direct Play');
    first.scheduler.dispose();

    const priority = fixture(); priority.scheduler.refresh();
    const leave = priority.scheduler.intent(item('d'));
    assert.deepEqual(priority.calls.map(call => call.id), ['a', 'b', 'd']);
    assert.equal(priority.calls[0].signal.aborted, true, 'Hover preempts an automatic request');
    priority.calls[1].finish(); await tick();
    assert.equal(priority.calls[2].signal.aborted, false, 'The automatic queue cannot evict deliberate intent');
    leave(); priority.scheduler.dispose();

    const quick = fixture(); quick.scheduler.refresh();
    const adopted = quick.scheduler.claim(item('c'));
    assert.equal(adopted, quick.calls[2].request, 'Play starts a queued target immediately');
    assert.equal(quick.calls[2].signal.aborted, false);
    quick.scheduler.dispose(); assert.equal(quick.calls[2].signal.aborted, false, 'Cleanup never aborts adopted playback');
    quick.calls[2].finish(); await adopted.promise; await tick();
    assert.equal(quick.calls.length, 3, 'Play stops the speculative queue');

    const scrolling = fixture(); scrolling.scheduler.refresh();
    scrolling.visible(['c', 'd']); scrolling.scheduler.refresh(); await tick();
    assert.deepEqual(scrolling.calls.map(call => call.id), ['a', 'b', 'c', 'd']);
    assert.ok(scrolling.calls.slice(0, 2).every(call => call.signal.aborted), 'Offscreen automatic requests release their slots');
    scrolling.allowed(false); scrolling.scheduler.clear();
    assert.ok(scrolling.calls.every(call => call.signal.aborted));
    scrolling.visible(['e']); scrolling.scheduler.refresh(); assert.equal(scrolling.calls.length, 4, 'Network guard blocks new work');
    scrolling.allowed(true); scrolling.scheduler.refresh(); assert.equal(scrolling.calls.at(-1).id, 'e');
    scrolling.scheduler.dispose(); await tick();
    assert.equal(timers.size, 0);
    console.log('PASS: four visible candidates, two concurrent discoveries, cached handoff, hover priority, immediate queued Play, scrolling and network cleanup');
})().catch(error => { console.error(error); process.exitCode = 1; });
