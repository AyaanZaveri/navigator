const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const captured = require('./fixtures/modern-family-s08e16-skips.json');
const context = { exports: {}, URLSearchParams, AbortSignal };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/media/skip-segments.ts', 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, context);
const { fetchSkipSegments, normalizeSkipSegments, activeSkipSegment, formatSkipTime } = context.exports;
const lookup = { id: 'tt1442437', type: 'series', season: 8, episode: 16, duration: 1342.1 };
const resolveIMDb = async () => 'tt1442437';
const fetcher = (skipdb = captured.skipdbExact, primary = captured.primary) => async url => Response.json(
    url.startsWith('https://api.theintrodb.org') ? primary : url.startsWith('https://api.skipdb.tv') ? skipdb : captured.introdb);
(async () => {
    assert.equal(formatSkipTime(98.8), '1:38.800');
    assert.equal(formatSkipTime(1329.6), '22:09.600');
    assert.equal(formatSkipTime(-34.6), '-0:34.600');
    assert.equal(formatSkipTime(59.9996), '1:00.000');
    // Public S6E4 responses: only SkipDB has an intro, for a 22:09.600 release.
    const s6e4 = { ...lookup, season: 6, episode: 4, duration: 1329.6 };
    const s6e4Provider = offset => async url => Response.json(url.startsWith('https://api.theintrodb.org')
        ? { group_duration_ms: 1295000, credits: [{ start_ms: 1057738, end_ms: null, confidence: 0 }] }
        : url.startsWith('https://api.skipdb.tv') ? {
            imdb_id: 'tt1442437', season: 6, episode: 4, segments: {
                intro: { start_ms: 98800, end_ms: 111400, offset_ms: offset,
                    match: offset ? 'out-of-range' : 'exact', confidence: offset ? 0.6 : 0.9 },
            },
        } : { intro: null, recap: null, outro: null });
    const s6e4Exact = await fetchSkipSegments(s6e4, new AbortController().signal, resolveIMDb, s6e4Provider(0));
    assert.equal(activeSkipSegment(s6e4Exact, 100)?.kind, 'intro', 'S6E4 offers Skip Intro during the verified matching release');
    assert.equal(activeSkipSegment(s6e4Exact, 111.4), undefined);
    const s6e4Mismatch = await fetchSkipSegments({ ...s6e4, duration: 1295 }, new AbortController().signal, resolveIMDb, s6e4Provider(-34600));
    assert.equal(s6e4Mismatch.length, 1);
    assert.equal(s6e4Mismatch[0].verification, 'unverified', 'S6E4 keeps its concrete intro as a labelled last resort');
    assert.equal(s6e4Mismatch[0].start, 98.8, 'Runtime differences must never shift the intro automatically');
    const controller = new AbortController();
    const exact = await fetchSkipSegments(lookup, controller.signal, resolveIMDb, fetcher());
    assert.deepEqual(Array.from(exact, s => [s.kind, s.start, s.end, s.provider]), [
        ['intro', 65.7, 78, 'skipdb'], ['credits', 1263, 1342.1, 'skipdb'],
    ], 'Exact release gets a real intro and closing credits, never the erroneous halfway credits');
    const uncertainRelease = await fetchSkipSegments({ ...lookup, duration: 1290 }, controller.signal, resolveIMDb,
        fetcher(captured.skipdbOtherRelease));
    assert.equal(uncertainRelease.length, 1, 'A different release retains only its short opening range, never its credits');
    assert.equal(uncertainRelease[0].verification, 'unverified');
    assert.equal(normalizeSkipSegments({ credits: [{ start_ms: 1111338, end_ms: null, confidence: 0, submission_count: 6 }] }, 'theintrodb', 1290).length, 0,
        'Zero-confidence averages are invalid even when their length looks plausible');
    assert.equal(normalizeSkipSegments({ group_duration_ms: 4469000, intro: [{ start_ms: 0, end_ms: 31400, confidence: 0.3 }] }, 'theintrodb', 1400).length, 0,
        'Provider fallback to a very different runtime must not bypass release matching');
    const breakingBadCredits = normalizeSkipSegments({ credits: [
        { start_ms: 291000, end_ms: 307000, confidence: 0.1 },
        { start_ms: 2787000, end_ms: 2846000, confidence: 0.175 },
    ] }, 'theintrodb', 2847);
    assert.equal(breakingBadCredits.length, 1, 'Captured Breaking Bad S5E14 opening titles mislabeled as credits cannot skip the story');
    assert.equal(breakingBadCredits[0].start, 2787);
    const weakIntro = { intro: [{ start_ms: 80000, end_ms: 92000, confidence: 0.2 }] };
    const crossChecked = await fetchSkipSegments(lookup, controller.signal, resolveIMDb, fetcher(captured.skipdbExact, weakIntro));
    assert.equal(crossChecked.find(s => s.kind === 'intro').provider, 'skipdb', 'A confident release-matched alternative beats weak primary consensus');
    const weakOnly = await fetchSkipSegments(lookup, controller.signal, resolveIMDb, fetcher({}, weakIntro));
    assert.equal(weakOnly.find(s => s.kind === 'intro').provider, 'theintrodb', 'Valid weak consensus remains available when there is no better source');
    const originalIntro = { intro: [{ start_ms: 80000, end_ms: 92000 }] };
    const preferred = await fetchSkipSegments(lookup, controller.signal, resolveIMDb, fetcher(captured.skipdbExact, originalIntro));
    assert.equal(preferred.find(s => s.kind === 'intro').provider, 'skipdb', 'SkipDB takes priority even over sound TheIntroDB timing');
    assert.equal(preferred.find(s => s.kind === 'credits').provider, 'skipdb', 'Priority is per kind, not per whole response');
    // Captured S5E11 API response, requested with its reference runtime of 21:49.5.
    const s5e11 = require('./fixtures/modern-family-s05e11-skips.json');
    const episodeLookup = { ...lookup, season: 5, episode: 11, duration: 1309.5 };
    const lowerPriority = { intro: [{ start_ms: 80000, end_ms: 92000 }], recap: [{ start_ms: 1000, end_ms: 12000 }] };
    const introFallback = { intro: { start_ms: 74000, end_ms: 87000 } };
    const selectEpisode = (skip, primary = lowerPriority) => fetchSkipSegments(episodeLookup, new AbortController().signal, resolveIMDb,
        async url => {
            if (url.startsWith('https://api.skipdb.tv')) return skip();
            return Response.json(url.startsWith('https://api.theintrodb.org') ? primary : introFallback);
        });
    const episodeSegments = await selectEpisode(() => Response.json(s5e11));
    assert.equal(activeSkipSegment(episodeSegments, 73).provider, 'skipdb');
    assert.equal(activeSkipSegment(episodeSegments, 73).end, 85.3);
    assert.equal(activeSkipSegment(episodeSegments, 85.3), undefined, 'Lower-priority intros never reappear after SkipDB ends');
    assert.equal(episodeSegments.find(s => s.kind === 'recap').provider, 'theintrodb', 'A missing SkipDB kind falls back independently');
    const mismatchedEpisode = { ...s5e11, segments: Object.fromEntries(Object.entries(s5e11.segments).map(([kind, segment]) =>
        [kind, segment ? { ...segment, match: 'out-of-range', offset_ms: -19500, confidence: 0.6 } : null])) };
    const selectMismatch = (primary = {}, fallback = {}) => fetchSkipSegments({ ...episodeLookup, duration: 1290 }, new AbortController().signal,
        resolveIMDb, async url => Response.json(url.startsWith('https://api.skipdb.tv') ? mismatchedEpisode
            : url.startsWith('https://api.theintrodb.org') ? primary : fallback));
    const uncertainEpisode = await selectMismatch();
    assert.deepEqual(Array.from(uncertainEpisode, s => [s.kind, s.start, s.end, s.verification]),
        [['intro', 72.7, 85.3, 'unverified']], 'S5E11 offers its actual intro even with a 19.5s runtime mismatch; credits stay strict');
    assert.equal(activeSkipSegment(uncertainEpisode, 73).end, 85.3);
    const disagreed = await selectMismatch(lowerPriority);
    assert.equal(disagreed.find(s => s.kind === 'intro').provider, 'theintrodb', 'An uncertain SkipDB intro never beats sound fallback timing');
    const corroborated = await selectMismatch({ group_duration_ms: 1334000, intro: [{ start_ms: 73000, end_ms: 85000, confidence: 0.4 }] });
    assert.equal(corroborated.find(s => s.kind === 'intro').provider, 'skipdb');
    assert.equal(corroborated.find(s => s.kind === 'intro').verification, 'corroborated', 'Agreeing providers rescue intros despite different reference runtimes');
    const introDBAgreement = await selectMismatch({}, introFallback);
    assert.equal(introDBAgreement.find(s => s.kind === 'intro').provider, 'skipdb');
    assert.equal(introDBAgreement.find(s => s.kind === 'intro').verification, 'corroborated');
    const oneBoundary = await selectMismatch({}, { intro: { start_ms: 73000, end_ms: 96000 } });
    assert.equal(oneBoundary.find(s => s.kind === 'intro').provider, 'introdb', 'Both boundaries must agree before promoting SkipDB');
    // Alternate timings from the same provider are not corroboration.
    const singleProvider = await fetchSkipSegments(episodeLookup, new AbortController().signal, resolveIMDb, async url =>
        Response.json(url.startsWith('https://api.theintrodb.org') ? { group_duration_ms: 1400000, intro: [
            { start_ms: 100000, end_ms: 120000 }, { start_ms: 101000, end_ms: 121000 },
        ] } : {}));
    assert.equal(singleProvider.length, 2);
    assert.ok(singleProvider.every(s => s.verification === 'unverified'));
    const unverifiedIntro = mismatchedEpisode.segments.intro;
    for (const patch of [{ start_ms: null }, { end_ms: null }, { end_ms: 250000 },
        { start_ms: 1000000, end_ms: 1010000 }, { confidence: 0.1 }, { adjusted: true }, { match: 'unknown' }]) {
        assert.equal(normalizeSkipSegments({ segments: { intro: { ...unverifiedIntro, ...patch } } }, 'skipdb', 1290, true).length, 0,
            'Uncertain intros still reject open, long, late, low-confidence, shifted, and malformed ranges');
    }
    assert.equal(normalizeSkipSegments({ segments: { recap: unverifiedIntro, outro: unverifiedIntro } }, 'skipdb', 1290, true).length, 0);
    assert.equal(normalizeSkipSegments({ group_duration_ms: 1342000, credits: [{ start_ms: 1260000, end_ms: null }] }, 'theintrodb', 1290, true).length, 0);
    for (const skip of [
        () => Response.json({ ...s5e11, segments: { intro: null } }),
        () => Response.json({ ...s5e11, segments: { intro: { ...s5e11.segments.intro, confidence: 0.1 } } }),
        () => Response.json({ ...s5e11, episode: 12 }),
        () => new Response(null, { status: 429 }),
        () => new Response('invalid json'),
        () => { throw new DOMException('Timed out', 'TimeoutError'); },
    ]) {
        assert.equal((await selectEpisode(skip)).find(s => s.kind === 'intro').provider, 'theintrodb', 'Missing, unusable, or failed SkipDB falls back');
        assert.equal((await selectEpisode(skip, {})).find(s => s.kind === 'intro').provider, 'introdb', 'Missing TheIntroDB continues to IntroDB');
    }
    let finishSkipDB;
    const delayedSkipDB = new Promise(resolve => { finishSkipDB = resolve; });
    const progressive = [];
    const delayedResult = fetchSkipSegments(episodeLookup, new AbortController().signal, resolveIMDb, async url => {
        if (url.startsWith('https://api.skipdb.tv')) return delayedSkipDB;
        return Response.json(url.startsWith('https://api.theintrodb.org') ? lowerPriority : introFallback);
    }, segments => progressive.push(segments));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(progressive.at(-1).find(s => s.kind === 'intro').provider, 'theintrodb', 'A slow first choice does not block fallback delivery');
    finishSkipDB(Response.json(s5e11));
    assert.equal((await delayedResult).find(s => s.kind === 'intro').provider, 'skipdb');
    assert.equal(progressive.at(-1).find(s => s.kind === 'intro').provider, 'skipdb', 'Late SkipDB replaces lower-priority results in the player');
    let finishTheIntroDB;
    const delayedTheIntroDB = new Promise(resolve => { finishTheIntroDB = resolve; });
    const skipFirstUpdates = [];
    const skipFirst = fetchSkipSegments(episodeLookup, new AbortController().signal, resolveIMDb, async url => {
        if (url.startsWith('https://api.theintrodb.org')) return delayedTheIntroDB;
        return Response.json(url.startsWith('https://api.skipdb.tv') ? s5e11 : introFallback);
    }, segments => skipFirstUpdates.push(segments));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(skipFirstUpdates.at(-1).find(s => s.kind === 'intro').provider, 'skipdb');
    finishTheIntroDB(Response.json(lowerPriority));
    assert.equal((await skipFirst).find(s => s.kind === 'intro').provider, 'skipdb', 'A late fallback cannot overwrite SkipDB');
    const segment = captured.skipdbExact.segments.intro;
    for (const patch of [{ match: 'out-of-range' }, { match: 'agnostic' }, { confidence: 0.7 }, { confidence: NaN },
        { confidence: 1.2 }, { offset_ms: 5000, adjusted: true }, { match: 'shifted', offset_ms: 16000 }, { start_ms: -1 }, { end_ms: 9999999 }]) {
        assert.equal(normalizeSkipSegments({ segments: { intro: { ...segment, ...patch } } }, 'skipdb', 1342.1).length, 0);
    }
    assert.equal(normalizeSkipSegments({ segments: { intro: { ...segment, match: 'shifted', offset_ms: -3000, confidence: 0.82 } } }, 'skipdb', 1342.1).length, 1);
    const nearbyUnshifted = normalizeSkipSegments({ segments: { intro: { ...segment, match: 'exact', adjusted: false, offset_ms: -10000 } } }, 'skipdb', 1332.1);
    assert.equal(nearbyUnshifted.length, 1, 'SkipDB adjust=none labels nearby, unshifted releases exact');
    assert.equal(nearbyUnshifted[0].start, segment.start_ms / 1000);
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
    assert.equal(new URL(calls.find(url => url.startsWith('https://api.skipdb.tv'))).searchParams.get('adjust'), 'none',
        'Runtime matching must not ask the provider to invent a timestamp shift');
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
    console.log('PASS: captured S05E11/S08E16 releases, SkipDB-first per-kind fallback, outages, response ordering, runtime/confidence validation, shared ID translation, progressive delivery, and cancellation.');
})().catch(error => { console.error(error); process.exitCode = 1; });
