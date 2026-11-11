const assert = require('node:assert/strict');
const { load, hooks } = require('./test-support/react-hooks.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const pendingTimers = new Map(); let timerId = 0, now = 0;
const moduleApi = load('lib/media/continue-watching-warmup.ts', {}, {
    setTimeout: fn => { const id = ++timerId; pendingTimers.set(id, fn); return id; }, clearTimeout: id => pendingTimers.delete(id),
});
const requests = [];
const create = (id, type, signal) => {
    const work = deferred();
    const request = { id, type, canonicalId: Promise.resolve(id), promise: work.promise,
        snapshot: { complete: false, streams: [] }, subscribe() { return () => {}; } };
    requests.push({ request, signal, ...work }); return request;
};
const movie = id => ({ id, type: 'movie' });
const resolve = load('lib/media/resolve-playback.ts');
(async () => {
    const owner = moduleApi.createContinueWatchingWarmup(create, () => now);
    owner.warm(movie('a'), true); owner.warm(movie('a')); owner.warm(movie('b'));
    assert.equal(requests.length, 2, 'Idle and intent discovery share one request per target');
    owner.warm(movie('c')); assert.equal(requests[0].signal.aborted, true, 'At most two speculative title requests survive');
    const claimed = owner.claim(movie('b'));
    assert.equal(claimed, requests[1].request, 'Play adopts the exact progressive request');
    assert.equal(owner.claim(movie('b')), claimed, 'Immediate repeated Play handoffs reuse the same unfinished request');
    owner.release(movie('b')); owner.dispose();
    assert.equal(requests[1].signal.aborted, false, 'Home cleanup cannot cancel adopted playback');
    assert.equal(requests[2].signal.aborted, true);
    requests[1].resolve([{ url: 'https://stream.test/warm.mp4' }]);
    let fresh = 0;
    const dependencies = { fetchStreams: async () => { fresh++; return [{ url: 'https://stream.test/fresh.mp4' }]; }, getNextEpisodeForSeries: async () => null };
    const media = { ...movie('b'), name: 'B', streamRequest: claimed, resumePositionTicks: 25 };
    const ready = await resolve.resolvePlayback(media, dependencies, () => {});
    assert.equal(ready.streamUrl, 'https://stream.test/warm.mp4'); assert.equal(ready.resumePositionTicks, 25); assert.equal(fresh, 0);
    resolve.invalidatePlaybackWarmup(claimed);
    await resolve.resolvePlayback(media, dependencies, () => {});
    assert.equal(fresh, 1, 'An explicit retry refreshes discovery instead of pinning signed URLs');

    const retryOwner = moduleApi.createContinueWatchingWarmup(create, () => now);
    retryOwner.warm(movie('failed'));
    const failed = retryOwner.claim(movie('failed')); requests.at(-1).reject(Error('offline'));
    const recovered = await resolve.resolvePlayback({ ...movie('failed'), name: 'Failed', streamRequest: failed }, dependencies, () => {});
    assert.equal(recovered.streamUrl, 'https://stream.test/fresh.mp4'); assert.equal(fresh, 2);
    retryOwner.warm(movie('expired')); const expired = requests.at(-1); now = 30_001;
    const newRequest = retryOwner.claim(movie('expired'));
    assert.equal(expired.signal.aborted, true); assert.notEqual(newRequest, expired.request, 'An expired lookup is refreshed exactly once on Play');
    newRequest.cancel();
    retryOwner.warm({ id: 'show', type: 'series' });
    assert.equal(requests.at(-1).request.id, 'expired', 'Never guess a resume episode');
    retryOwner.warm({ id: 'show', type: 'series', mediaSourceId: 'show:2:3' });
    assert.equal(requests.at(-1).request.id, 'show:2:3');
    retryOwner.warm({ ...movie('direct'), streamUrl: 'https://stream.test/direct.mp4' });
    assert.notEqual(requests.at(-1).request.id, 'direct', 'No discovery when Play already has a stream URL');
    retryOwner.dispose(); assert.equal(pendingTimers.size, 0);

    const closing = moduleApi.createContinueWatchingWarmup(create, () => now);
    closing.warm(movie('closing'));
    const adopted = closing.claim(movie('closing')), controller = new AbortController();
    const playback = resolve.resolvePlayback({ ...movie('closing'), name: 'Closing', streamRequest: adopted }, { ...dependencies, signal: controller.signal }, () => {});
    closing.dispose(); assert.equal(requests.at(-1).signal.aborted, false);
    controller.abort(); await tick(); assert.equal(requests.at(-1).signal.aborted, true, 'Playback owns cancellation after adopting the warmup');
    requests.at(-1).reject(Error('cancelled'));
    await assert.rejects(playback); assert.equal(fresh, 2, 'Cancellation never triggers a fresh speculative retry');

    const replayOwner = moduleApi.createContinueWatchingWarmup(create, () => now);
    const early = replayOwner.claim(movie('quick'));
    const held = requests.at(-1), created = requests.length;
    const firstController = new AbortController(), nextController = new AbortController();
    const earlyMedia = { ...movie('quick'), name: 'Quick', streamRequest: early };
    const firstPlay = resolve.resolvePlayback(earlyMedia, { ...dependencies, environment: 'native', signal: firstController.signal }, () => {}).catch(error => error);
    firstController.abort();
    const replay = resolve.resolvePlayback(earlyMedia, { ...dependencies, environment: 'native', signal: nextController.signal }, () => {});
    replayOwner.dispose(); await tick();
    assert.equal(requests.length, created); assert.equal(fresh, 2, 'Quick Play and immediate lifecycle replay cannot refetch unfinished discovery');
    assert.equal(held.signal.aborted, false, 'A replacement playback owner keeps the existing lookup alive');
    held.resolve([{ url: 'https://stream.test/quick.mp4' }]);
    await firstPlay; const played = await replay;
    assert.equal(played.streamUrl, 'https://stream.test/quick.mp4'); assert.equal(fresh, 2);

    const host = hooks(), listeners = new Map(), idle = new Map(), warmed = [];
    let markers = true, imagePending = true, network = true, authenticated = true, playing = false, enabled = false, changes;
    const bounds = () => ({ top: 0, bottom: 100, left: 0, right: 100 });
    const page = { querySelectorAll: selector => selector === 'img' ? [{ complete: !imagePending, getBoundingClientRect: bounds }] : markers ? [{ getBoundingClientRect: bounds }] : [],
        addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) };
    const root = { closest: () => page, getBoundingClientRect: bounds };
    const owners = [];
    const { ContinueWatchingWarmup } = load('components/continue-watching-warmup.tsx', {
        react: host.react, 'react/jsx-runtime': host.jsx,
        '@/contexts/account-context': { useAccountAccess: () => ({ authenticated }) },
        '@/contexts/settings-context': { useSettings: () => ({ playbackPreferences: { continueWatchingPrefetch: enabled } }) },
        '@/contexts/MediaPlayerContext': { useIsPlayerVisible: () => playing },
        '@/lib/route-prefetch': { routePrefetchAllowed: () => network },
        '@/lib/media/continue-watching-warmup': { continueWatchingTarget: moduleApi.continueWatchingTarget,
            createContinueWatchingWarmup() { const owner = { disposed: false, warm: item => warmed.push(item.id), clear() {}, claim() {}, dispose() { this.disposed = true; } }; owners.push(owner); return owner; } },
    }, { window: { innerWidth: 1000, innerHeight: 800, requestIdleCallback: fn => { const id = ++timerId; idle.set(id, fn); return id; }, cancelIdleCallback: id => idle.delete(id) },
        navigator: {}, document: { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) },
        MutationObserver: class { constructor(fn) { changes = fn; } observe() {} disconnect() {} },
        IntersectionObserver: class { observe() {} disconnect() {} },
    });
    const items = [movie('first'), movie('second')];
    const render = () => { const tree = host.render(ContinueWatchingWarmup, { items, children: null }); tree.props.children.props.ref.current = root; host.flush(); return tree; };
    const disabled = render();
    disabled.props.value.intent(movie('disabled'))();
    assert.equal(disabled.props.value.claim(movie('disabled')), undefined);
    assert.equal(owners.length, 0, 'Disabled preloading starts no idle, hover or click warmup');
    enabled = true;
    render(); assert.equal(idle.size, 0, 'Never compete with visible pending catalog rows');
    markers = false; changes(); assert.equal(idle.size, 0, 'Wait for visible images too');
    imagePending = false; listeners.get('load')(); assert.equal(idle.size, 1);
    const run = [...idle.values()][0]; idle.clear(); run(); assert.deepEqual(warmed, ['first'], 'Only the most recent eligible item warms automatically');
    network = false; listeners.get('visibilitychange')(); network = true;
    playing = true; render(); assert.equal(owners[0].disposed, true);
    playing = false; authenticated = false; render(); assert.equal(owners.length, 1, 'Guests never start discovery');
    authenticated = true; render(); assert.equal(idle.size, 1);
    enabled = false; render();
    assert.equal(owners[1].disposed, true, 'Turning preloading off disposes speculative requests');
    assert.equal(idle.size, 0, 'Turning preloading off cancels queued idle work');
    enabled = true; render(); assert.equal(owners.length, 3, 'Preloading can be re-enabled without remounting');
    host.unmount(); await tick();
    console.log('PASS: two-title warmup bound, exact request transfer, cancellation/TTL/account cleanup, fresh failure retry, resume identity and visible-content/idle/network gating');
})().catch(error => { console.error(error); process.exitCode = 1; });
