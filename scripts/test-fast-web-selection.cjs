const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const timers = new Map();
let timerId = 0;
function load(file, requireFn = require) {
    const context = { exports: {}, require: requireFn,
        setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
        clearTimeout(id) { timers.delete(id); } };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText, context);
    return context.exports;
}
const language = load('lib/media/audio-language.ts');
const { resolvePlayback } = load('lib/media/resolve-playback.ts', name => {
    if (name === '@/lib/media/stream-release-info') return load('lib/media/stream-release-info.ts');
    assert.equal(name, '@/lib/media/audio-language');
    return language;
});
function deferred() {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function source() {
    const done = deferred(), listeners = new Set();
    const request = { id: 'movie', type: 'movie', canonicalId: Promise.resolve('movie'), promise: done.promise,
        snapshot: { streams: [], complete: false, pending: 2, total: 2 },
        subscribe(listener) { listeners.add(listener); listener(request.snapshot); return () => listeners.delete(listener); },
        publish(streams, complete = false) {
            request.snapshot = { streams, complete, pending: complete ? 0 : 1, total: 2 };
            for (const listener of listeners) listener(request.snapshot);
            if (complete) done.resolve(streams);
        },
        listeners,
    };
    return request;
}
const stream = (id, quality = '1080p') => ({ url: `https://example.test/${id}.mp4`, title: `${quality} H264 AAC` });
const tracks = (audio = true) => ({ mimeType: 'video/mp4', video: { codec: 'avc', codecString: 'avc1.640028' },
    audio: audio ? [{ codec: 'aac', codecString: 'mp4a.40.2', primary: true, language: 'en' }] : [] });
const request = { id: 'movie', type: 'movie', name: 'Movie' };
const base = { environment: 'web', autoSelectWebStream: true, canPlayType: () => true,
    fetchStreams: async () => { throw Error('Should share progressive request'); },
    getNextEpisodeForSeries: async () => null };

(async () => {
    // A fast verified second candidate must not wait behind the first or a slow addon.
    const progressive = source(), checks = new Map(), candidates = [];
    let running = 0, peak = 0, settled = false;
    const controller = new AbortController();
    const pending = resolvePlayback(request, { ...base, signal: controller.signal,
        createStreamRequest: () => progressive, onCandidates: values => candidates.push(values),
        inspectStream: candidate => {
            running++; peak = Math.max(peak, running);
            const check = deferred(); checks.set(candidate.url, check);
            return check.promise.finally(() => running--);
        },
    }, () => {}).then(value => { settled = true; return value; });
    const slow = stream('slow', '2160p'), fast = stream('fast'), later = stream('later', '720p');
    progressive.publish([slow, fast]);
    await flush();
    assert.equal(checks.size, 2);
    checks.get(fast.url).resolve(tracks());
    await flush();
    assert.equal(settled, true, 'Verified success cannot wait for higher-ranked slow probe or addon completion');
    const result = await pending;
    assert.equal(result.streamUrl, fast.url);
    assert.equal(result.streamRequest, progressive, 'Retain shared request for fallback, including late arrivals');
    assert.equal(progressive.snapshot.complete, false);
    assert.ok(![...timers.values()].some(timer => timer.delay === 400), 'An early winner cancels the third-probe hedge');
    progressive.publish([slow, fast, later], true);
    await flush();
    assert.ok(checks.has(later.url), 'Backups are inspected after initial selection');
    checks.get(later.url).resolve(tracks()); checks.get(slow.url).resolve(tracks(false));
    await flush();
    assert.equal(peak, 2, 'No more than two probes run concurrently');
    assert.ok(candidates.at(-1).some(value => value.url === later.url));
    assert.ok(!candidates.at(-1).some(value => value.url === slow.url), 'Known missing audio is removed');
    assert.equal(progressive.listeners.size, 0);
    assert.equal(timers.size, 0);

    // Hedge a slow initial pair after 400 ms, but never fan out beyond three.
    const hedgedSource = source(), hedgeChecks = new Map();
    const hedgeStreams = Array.from({ length: 7 }, (_, i) => stream(`hedge-${i}`));
    let hedgeRunning = 0, hedgePeak = 0;
    const hedgedPending = resolvePlayback({ ...request, streamRequest: hedgedSource }, { ...base,
        inspectStream: candidate => {
            hedgeRunning++; hedgePeak = Math.max(hedgePeak, hedgeRunning);
            const check = deferred(); hedgeChecks.set(candidate.url, check);
            return check.promise.finally(() => hedgeRunning--);
        },
    }, () => {});
    hedgedSource.publish(hedgeStreams, true); await flush();
    assert.equal(hedgeChecks.size, 2, 'Start only two probes immediately');
    const hedgeEntry = [...timers.entries()].find(([, timer]) => timer.delay === 400);
    assert.ok(hedgeEntry, 'Schedule a third-probe hedge at 400ms');
    timers.delete(hedgeEntry[0]); hedgeEntry[1].callback(); await flush();
    assert.equal(hedgeChecks.size, 3, 'A slow pair releases a third probe after the hedge delay');
    hedgeChecks.get(hedgeStreams[2].url).resolve(tracks()); await flush();
    assert.equal((await hedgedPending).streamUrl, hedgeStreams[2].url, 'The third probe can win without waiting for the first pair');
    assert.equal(hedgePeak, 3);
    assert.equal(hedgeChecks.size, 3, 'After a winner, do not add work while two initial probes remain active');
    for (const check of hedgeChecks.values()) check.resolve(tracks(false));
    await flush();
    assert.equal(hedgeChecks.size, 5, 'Background checking retains the five-candidate total cap');
    assert.equal(hedgeRunning, 2, 'After selection, background concurrency returns to two');
    for (const check of hedgeChecks.values()) check.resolve(tracks(false));
    await flush();
    assert.equal(hedgedSource.listeners.size, 0);
    assert.equal(timers.size, 0, 'Hedge and deadline timers are cleaned up');

    // Canonicalized playback must still share a page's original TMDB request on fallback.
    const canonicalSource = source();
    canonicalSource.id = 'tmdb:123';
    canonicalSource.canonicalId = Promise.resolve('movie');
    canonicalSource.publish([fast, later], true);
    const canonicalFallback = await resolvePlayback({ ...request, streamRequest: canonicalSource }, { ...base,
        excludeUrls: new Set([fast.url]), inspectStream: async () => tracks(),
    }, () => {});
    assert.equal(canonicalFallback.streamUrl, later.url);
    assert.equal(canonicalFallback.streamRequest, canonicalSource);

    // Unknown is distinct from rejected: use it at the bounded decision deadline.
    const unknownSource = source(), unknown = stream('unknown');
    let unknownSettled = false;
    const unknownPending = resolvePlayback({ ...request, streamRequest: unknownSource }, { ...base,
        inspectStream: async () => { throw Error('CORS'); },
    }, () => {}).then(value => { unknownSettled = true; return value; });
    unknownSource.publish([unknown]); await flush();
    assert.equal(unknownSettled, false, 'Give pending addons a bounded chance to return a verified alternative');
    const deadline = [...timers.values()].find(timer => timer.delay === 2200);
    assert.ok(deadline); deadline.callback(); await flush();
    assert.equal((await unknownPending).streamUrl, unknown.url);
    unknownSource.publish([unknown], true); await flush();
    assert.equal(unknownSource.listeners.size, 0);

    // Rejected early results do not prevent a later addon from providing a working stream.
    const lateSource = source(), silent = stream('silent'), good = stream('good');
    let lateSettled = false;
    const latePending = resolvePlayback({ ...request, streamRequest: lateSource }, { ...base,
        inspectStream: async candidate => tracks(candidate.url !== silent.url),
    }, () => {}).then(value => { lateSettled = true; return value; });
    lateSource.publish([silent]); await flush();
    assert.equal(lateSettled, false);
    lateSource.publish([silent, good], true); await flush();
    assert.equal((await latePending).streamUrl, good.url);

    const rejectedSource = source();
    const rejected = resolvePlayback({ ...request, streamRequest: rejectedSource }, { ...base,
        inspectStream: async () => tracks(false),
    }, () => {});
    rejectedSource.publish([silent], true);
    await assert.rejects(rejected, /No playable streams/);

    // Cancellation detaches subscriptions/timers and never publishes stale probe results.
    const cancelledSource = source(), abort = new AbortController(), checking = deferred();
    const cancelled = resolvePlayback({ ...request, streamRequest: cancelledSource }, { ...base,
        signal: abort.signal, inspectStream: () => checking.promise,
    }, () => {});
    cancelledSource.publish([good]); await flush();
    abort.abort(new Error('cancelled'));
    await assert.rejects(cancelled, /cancelled/);
    assert.equal(cancelledSource.listeners.size, 0);
    checking.resolve(tracks()); await flush();
    assert.equal(timers.size, 0);

    const immediateSource = source(), immediateAbort = new AbortController();
    let startedAfterAbort = 0;
    const immediate = resolvePlayback({ ...request, streamRequest: immediateSource }, { ...base,
        signal: immediateAbort.signal, inspectStream: async () => { startedAfterAbort++; return tracks(); },
    }, () => {});
    immediateSource.publish([good]);
    immediateAbort.abort(new Error('cancelled before probe microtask'));
    await assert.rejects(immediate, /cancelled before probe/);
    await flush();
    assert.equal(startedAfterAbort, 0, 'Aborting before queued probes run must not start network work');
    assert.equal(immediateSource.listeners.size, 0);
    assert.equal(timers.size, 0);

    // Native and default-off selection continue waiting for the full provider-ordered list.
    for (const overrides of [{ environment: 'native' }, { autoSelectWebStream: false }]) {
        const original = source(); let ready = false;
        const pendingOriginal = resolvePlayback({ ...request, streamRequest: original }, { ...base, ...overrides,
            inspectStream: async () => assert.fail('Non-auto playback must not inspect streams'),
        }, () => {}).then(value => { ready = true; return value; });
        original.publish([good]); await flush(); assert.equal(ready, false);
        original.publish([slow, good], true); await flush();
        assert.equal((await pendingOriginal).streamUrl, slow.url);
    }
    console.log('PASS: progressive first-compatible selection, adaptive two-to-three concurrency, bounded backups, unknown deadline, rejected audio, cancellation, and unchanged native/default ordering.');
})().catch(error => { console.error(error); process.exitCode = 1; });
