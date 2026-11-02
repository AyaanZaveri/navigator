const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const captured = require('./fixtures/modern-family-s08e16-skips.json');
const context = { exports: {}, URLSearchParams, AbortSignal };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/media/skip-segments.ts', 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, context);
const { fetchSkipSegments, normalizeSkipSegments } = context.exports;
const lookup = { id: 'tt1442437', type: 'series', season: 8, episode: 16, duration: 1342.1 };
const resolveIMDb = async () => 'tt1442437';
const fetcher = (skipdb = captured.skipdbExact, primary = captured.primary) => async url => Response.json(
    url.startsWith('https://api.theintrodb.org') ? primary : url.startsWith('https://api.skipdb.tv') ? skipdb : captured.introdb);
(async () => {
    const controller = new AbortController();
    const exact = await fetchSkipSegments(lookup, controller.signal, resolveIMDb, fetcher());
    assert.deepEqual(Array.from(exact, s => [s.kind, s.start, s.end, s.provider]), [
        ['intro', 65.7, 78, 'skipdb'], ['credits', 1263, 1342.1, 'skipdb'],
    ], 'Exact release gets a real intro and closing credits, never the erroneous halfway credits');
    assert.equal((await fetchSkipSegments({ ...lookup, duration: 1290 }, controller.signal, resolveIMDb,
        fetcher(captured.skipdbOtherRelease))).length, 0, 'Other-release data must not create a skip button just because its intro fits');
    assert.equal(normalizeSkipSegments({ credits: [{ start_ms: 1111338, end_ms: null, confidence: 0, submission_count: 6 }] }, 'theintrodb', 1290).length, 0,
        'Zero-confidence averages are invalid even when their length looks plausible');
    assert.equal(normalizeSkipSegments({ group_duration_ms: 4469000, intro: [{ start_ms: 0, end_ms: 31400, confidence: 0.3 }] }, 'theintrodb', 1400).length, 0,
        'Provider fallback to a very different runtime must not bypass release matching');
    const weakIntro = { intro: [{ start_ms: 80000, end_ms: 92000, confidence: 0.2 }] };
    const crossChecked = await fetchSkipSegments(lookup, controller.signal, resolveIMDb, fetcher(captured.skipdbExact, weakIntro));
    assert.equal(crossChecked.find(s => s.kind === 'intro').provider, 'skipdb', 'A confident release-matched alternative beats weak primary consensus');
    const weakOnly = await fetchSkipSegments(lookup, controller.signal, resolveIMDb, fetcher({}, weakIntro));
    assert.equal(weakOnly.find(s => s.kind === 'intro').provider, 'theintrodb', 'Valid weak consensus remains available when there is no better source');
    const originalIntro = { intro: [{ start_ms: 80000, end_ms: 92000 }] };
    const preferred = await fetchSkipSegments(lookup, controller.signal, resolveIMDb, fetcher(captured.skipdbExact, originalIntro));
    assert.equal(preferred.find(s => s.kind === 'intro').provider, 'theintrodb');
    assert.equal(preferred.find(s => s.kind === 'credits').provider, 'skipdb', 'Priority is per kind, not per whole response');
    const segment = captured.skipdbExact.segments.intro;
    for (const patch of [{ match: 'out-of-range' }, { match: 'agnostic' }, { confidence: 0.7 }, { confidence: NaN },
        { confidence: 1.2 }, { offset_ms: 5000 }, { match: 'shifted', offset_ms: 16000 }, { start_ms: -1 }, { end_ms: 9999999 }]) {
        assert.equal(normalizeSkipSegments({ segments: { intro: { ...segment, ...patch } } }, 'skipdb', 1342.1).length, 0);
    }
    assert.equal(normalizeSkipSegments({ segments: { intro: { ...segment, match: 'shifted', offset_ms: -3000, confidence: 0.82 } } }, 'skipdb', 1342.1).length, 1);
    assert.equal(normalizeSkipSegments({ intro_length_estimate_ms: 12500, segments: { intro: null } }, 'skipdb', 1342.1).length, 0, 'Season estimates never become guessed episode markers');
    assert.equal((await fetchSkipSegments(lookup, controller.signal, resolveIMDb,
        fetcher({ ...captured.skipdbExact, episode: 15 }))).length, 0, 'Reject mismatched response episode');
    const calls = [];
    let translations = 0;
    await fetchSkipSegments({ ...lookup, id: 'tmdb:1421' }, controller.signal, async () => { translations++; return 'tt1442437'; }, async url => {
        calls.push(url); return fetcher()(url);
    });
    assert.equal(translations, 1, 'Both IMDb-only fallbacks share one ID translation');
    assert.ok(calls.find(url => url.startsWith('https://api.skipdb.tv')).includes('duration=1342.1'));
    let releaseSlow;
    const slow = new Promise(resolve => { releaseSlow = resolve; });
    const updates = [];
    const pending = fetchSkipSegments(lookup, controller.signal, resolveIMDb, async url => {
        if (url.startsWith('https://api.skipdb.tv')) return slow;
        return Response.json(url.startsWith('https://api.theintrodb.org') ? originalIntro : {});
    }, segments => updates.push(segments));
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(updates.some(segments => segments.some(s => s.provider === 'theintrodb')), 'Fast provider renders while slow fallback is still pending');
    const beforeCancel = updates.length;
    controller.abort();
    releaseSlow(Response.json(captured.skipdbExact));
    assert.equal((await pending).length, 0);
    assert.equal(updates.length, beforeCancel, 'A cancelled source never updates the UI');
    console.log('PASS: captured S08E16 releases, runtime/confidence validation, conservative fallback priority, shared ID translation, progressive delivery, and cancellation.');
})().catch(error => { console.error(error); process.exitCode = 1; });
