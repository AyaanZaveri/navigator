const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const timers = new Map(); let timerId = 0;
function load(file) {
    const context = { exports: {}, AbortController, setTimeout(fn, ms) { timers.set(++timerId, { fn, ms }); return timerId; },
        clearTimeout(id) { timers.delete(id); }, require(name) { return load(name.replace('@/', '') + '.ts'); } };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText, context);
    return context.exports;
}
const { resolvePlayback } = load('lib/media/resolve-playback.ts');
function deferred() { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; }
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
const streams = Array.from({ length: 8 }, (_, i) => ({ url: `https://example.test/${i}.mp4`, title: '1080p H264 AAC' }));
const request = { id: 'movie', type: 'movie', resumePositionTicks: 123 };
const base = { environment: 'web', autoSelectWebStream: true, canPlayType: () => true,
    fetchStreams: async () => streams, getNextEpisodeForSeries: async () => null };

(async () => {
    const checks = new Map(), controller = new AbortController();
    let settled = false;
    const pending = resolvePlayback(request, { ...base, signal: controller.signal,
        inspectStream: async () => undefined,
        verifyStream: (candidate, options) => { const check = deferred(); checks.set(candidate.url, { ...check, signal: options.signal }); return check.promise; },
    }, () => {}).then(result => { settled = true; return result; });
    await flush();
    assert.equal(checks.size, 5, 'The top five must start concurrently without a hedge delay');
    checks.get(streams[4].url).resolve('supported'); await flush();
    assert.equal(settled, true, 'A decoded fifth source cannot wait behind four slow higher-ranked probes');
    assert.equal((await pending).streamUrl, streams[4].url);
    assert.equal((await pending).resumePositionTicks, 123);
    controller.abort();
    for (const check of checks.values()) { assert.equal(check.signal.aborted, true); check.resolve('unknown'); }
    await flush(); assert.equal(timers.size, 0);

    // Filename claims and readable headers must not allow a silent preview into the main player.
    const claimed = { video: { codec: 'avc', codecString: 'avc1.640028' }, audio: [{ codec: 'aac', codecString: 'mp4a.40.2', primary: true }] };
    await assert.rejects(resolvePlayback(request, { ...base, fetchStreams: async () => streams.slice(0, 5),
        inspectStream: async () => claimed, verifyStream: async () => 'unsupported',
    }, () => {}), /verified|audio|video/i);
    await assert.rejects(resolvePlayback(request, { ...base, fetchStreams: async () => streams.slice(0, 5),
        inspectStream: async () => claimed, verifyStream: async () => 'unknown',
    }, () => {}), /verified|audio|video/i);
    await assert.rejects(resolvePlayback(request, { ...base, fetchStreams: async () => streams.slice(0, 5),
        inspectStream: async () => claimed,
    }, () => {}), /verified|audio|video/i, 'Missing verification must fail closed, not restore metadata-only playback');
    await assert.rejects(resolvePlayback({ ...request, streamUrl: streams[0].url }, { ...base,
        verifyStream: async () => 'unsupported',
    }, () => {}), /verified|audio|video/i, 'An explicit URL must not bypass enabled audiovisual verification');

    const checked = [];
    const sixth = await resolvePlayback(request, { ...base,
        verifyStream: async candidate => { checked.push(candidate.url); return candidate === streams[5] ? 'supported' : 'unsupported'; },
    }, () => {});
    assert.equal(sixth.streamUrl, streams[5].url, 'Rejected first five should release slots for later candidates');
    assert.ok(checked.length >= 6);
    assert.equal(timers.size, 0);
    console.log('PASS: five simultaneous audiovisual probes, first verified winner, no unknown promotion, and rolling rejection replacement.');
})().catch(error => { console.error(error); process.exitCode = 1; });
