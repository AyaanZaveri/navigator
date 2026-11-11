const assert = require('node:assert/strict');
const { load, hooks } = require('./test-support/react-hooks.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

function nodes(node) {
    if (!node || typeof node !== 'object') return [];
    return [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
}

async function buttonTests() {
    const h = hooks();
    let watched = false;
    let known = true;
    const saves = [];
    const save = () => { const work = deferred(); saves.push(work); return work.promise; };
    const { WatchToggleButton } = load('components/media-page/watch-toggle-button.tsx', {
        react: h.react, 'react/jsx-runtime': h.jsx,
        '@/components/ui/button': { Button: 'button' },
        '@/components/ui/tooltip': { Tooltip: 'tooltip', TooltipContent: 'tip', TooltipTrigger: 'trigger' },
        'lucide-react': { Check: 'check' },
        '@/contexts/watch-history-context': { useWatchStatus: () => ({ watched, known,
            toggle() { watched = !watched; return save(); },
            update(item) { watched = item.movieWatched; },
        }) },
        '@/app/actions/watch-history': { setWatchedStatus: save },
    });
    const render = () => h.render(WatchToggleButton, { media: { id: 'movie', type: 'movie', name: 'Movie' } });
    const button = () => nodes(render()).find(node => node.type === 'button');
    const first = button().props.onClick();
    assert.equal(button().props['aria-pressed'], true, 'Watched feedback must change before a held request resolves');
    assert.equal(button().props.disabled, false, 'Saving must not disable a known toggle');
    const second = button().props.onClick();
    assert.equal(button().props['aria-pressed'], false);
    saves[0].resolve(false); await first;
    assert.ok(!nodes(render()).some(node => node.props?.role === 'alert'), 'An older failed click cannot overwrite the latest intent');
    saves[1].resolve(true); await second;
    assert.equal(button().props['aria-busy'], undefined);
    const third = button().props.onClick();
    watched = false; saves[2].resolve(false); await third;
    assert.ok(nodes(render()).some(node => node.props?.role === 'alert'));
    known = false;
    assert.equal(button().props.disabled, true, 'Unknown initial state must still load before toggling');
}

async function queueTests() {
    const { createWatchStatusQueue } = load('lib/watch-status-queue.ts');
    const state = new Map([
        ['movie:movie', { movieWatched: false, watchedEpisodeIds: [] }],
        ['series:show', { movieWatched: false, watchedEpisodeIds: ['show:1:3'] }],
    ]);
    const server = new Map([...state].map(([key, item]) => [key, { ...item, watchedEpisodeIds: [...item.watchedEpisodeIds] }]));
    const key = input => `${input.type}:${input.id}`;
    const writes = [], settled = [];
    const queue = createWatchStatusQueue({
        read: input => state.get(key(input)), update: (input, item) => state.set(key(input), item),
        save(input) { const work = deferred(); writes.push({ input, ...work }); return work.promise; },
        settled: input => settled.push(key(input)),
    });
    const finish = (index, ok = true) => {
        const work = writes[index];
        if (!ok) { work.resolve(null); return; }
        const item = server.get(key(work.input));
        if (work.input.type === 'movie') item.movieWatched = work.input.watched;
        else {
            const videos = new Set(item.watchedEpisodeIds);
            if (work.input.watched) videos.add(work.input.videoId); else videos.delete(work.input.videoId);
            item.watchedEpisodeIds = [...videos];
        }
        work.resolve({ ...item, watchedEpisodeIds: [...item.watchedEpisodeIds] });
    };
    const movie = { id: 'movie', type: 'movie', name: 'Movie' };
    const a = queue.toggle(movie);
    assert.equal(state.get('movie:movie').movieWatched, true);
    const b = queue.toggle(movie);
    assert.equal(state.get('movie:movie').movieWatched, false);
    const c = queue.toggle(movie);
    assert.equal(writes.length, 1, 'Rapid toggles never run concurrent writes for one title');
    finish(0); await tick();
    assert.ok((await Promise.all([a, b, c])).every(Boolean));
    assert.equal(writes.length, 1, 'Latest desired value coalesces redundant queued writes');
    assert.equal(settled.length, 1);

    const unwatch = queue.toggle(movie);
    const rewatch = queue.toggle(movie);
    assert.equal(state.get('movie:movie').movieWatched, true);
    finish(1); await tick();
    assert.equal(state.get('movie:movie').movieWatched, true, 'Older successful response cannot flash over a newer intent');
    assert.equal(writes[2].input.watched, true);
    finish(2); await tick();
    assert.ok((await Promise.all([unwatch, rewatch])).every(Boolean));
    const failure = queue.toggle(movie);
    finish(3, false); await tick();
    assert.equal(await failure, false);
    assert.equal(state.get('movie:movie').movieWatched, true, 'Failed final write restores confirmed state');
    const staleFailure = queue.toggle(movie);
    const superseding = queue.toggle(movie);
    finish(4, false); await tick();
    assert.ok((await Promise.all([staleFailure, superseding])).every(Boolean), 'Superseded failure does not report failure for fulfilled latest intent');

    const episode = videoId => ({ id: 'show', type: 'series', name: 'Show', videoId });
    const firstEpisode = queue.toggle(episode('show:1:1'));
    const secondEpisode = queue.toggle(episode('show:1:2'));
    assert.deepEqual([...state.get('series:show').watchedEpisodeIds], ['show:1:3', 'show:1:1', 'show:1:2']);
    assert.equal(writes.length, 6, 'Different episodes share one serial title queue');
    finish(5, false); await tick();
    assert.equal(await firstEpisode, false);
    assert.deepEqual([...state.get('series:show').watchedEpisodeIds], ['show:1:3', 'show:1:2'], 'Rollback preserves another episode’s pending intent and existing history');
    finish(6); await tick();
    assert.equal(await secondEpisode, true);
    assert.deepEqual([...state.get('series:show').watchedEpisodeIds], ['show:1:3', 'show:1:2']);

    const disposing = queue.toggle(movie);
    const queued = queue.toggle(movie);
    const count = writes.length;
    queue.dispose(); finish(count - 1); await tick();
    assert.deepEqual(await Promise.all([disposing, queued]), [false, false]);
    assert.equal(writes.length, count, 'Leaving an account stops queued writes after the current request');
    assert.equal(await queue.toggle(movie), false);
}

async function providerTests() {
    const h = hooks();
    const events = new EventTarget();
    const timers = new Map(), reads = [], writes = [];
    let timerId = 0;
    const { WatchHistoryProvider } = load('contexts/watch-history-context.tsx', {
        react: h.react, 'react/jsx-runtime': h.jsx,
        '@/app/actions/watch-history': {
            fetchWatchedItems(requests) { const work = deferred(); reads.push({ requests, ...work }); return work.promise; },
            setWatchedStatus(input) { const work = deferred(); writes.push({ input, ...work }); return work.promise; },
        },
    }, { window: events, CustomEvent,
        setTimeout(fn) { timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); },
    });
    const render = () => { const value = h.render(WatchHistoryProvider, { children: null }).props.value; h.flush(); return value; };
    const flush = () => { const work = [...timers.values()]; timers.clear(); work.forEach(run => run()); };
    let value = render();
    const request = { id: 'movie', type: 'movie', name: 'Movie' };
    value.subscribe(request); flush();
    reads[0].resolve({ 'movie:movie': { movieWatched: false, watchedEpisodeIds: [] } }); await tick();
    value = render();
    events.dispatchEvent(new Event('focus')); flush();
    const save = value.toggle(request);
    assert.equal(render().items['movie:movie'].movieWatched, true, 'All shared consumers see optimism immediately');
    reads[1].resolve({ 'movie:movie': { movieWatched: false, watchedEpisodeIds: [] } }); await tick();
    assert.equal(render().items['movie:movie'].movieWatched, true, 'A read started before the click cannot overwrite optimism');
    events.dispatchEvent(new Event('focus'));
    events.dispatchEvent(new CustomEvent('navigator-watch-history-changed', { detail: { id: 'movie' } })); flush();
    assert.equal(reads.length, 2, 'Focus/playback refreshes wait until optimistic writes settle');
    writes[0].resolve({ movieWatched: true, watchedEpisodeIds: [] }); await save; await tick(); flush();
    assert.equal(reads.length, 3, 'Settling a write refreshes shared playback data once');
    reads[2].resolve({ 'movie:movie': { movieWatched: true, watchedEpisodeIds: [] } }); await tick();
    value = render();
    const leaving = value.toggle(request);
    const stateAtExit = render().items;
    h.unmount();
    writes[1].resolve({ movieWatched: false, watchedEpisodeIds: [] }); await leaving; await tick();
    assert.equal(render().items, stateAtExit, 'A late save cannot change state after provider cleanup');
}

(async () => {
    await buttonTests(); await queueTests(); await providerTests();
    console.log('PASS: instant enabled toggle, coalesced serial saves, shared optimism, stale read/response protection, rollback, episode isolation and account cleanup');
})().catch(error => { console.error(error); process.exitCode = 1; });
