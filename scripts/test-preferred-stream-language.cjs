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
const flush = async () => { for (let i = 0; i < 60; i++) await Promise.resolve(); };
const candidates = Array.from({ length: 8 }, (_, i) => ({ url: `https://example.test/${i}.m3u8`, title: `stream ${i}` }));
const request = { id: 'movie', type: 'movie' };
const base = { environment: 'web', autoSelectWebStream: true, canPlayType: () => true,
    fetchStreams: async () => candidates.slice(0, 5), getNextEpisodeForSeries: async () => null };

// Test the real selector while keeping each metadata read, decoder result, and
// timer under explicit control. A probe may report language before it resolves.
async function selector({ preferred = 'en', metadata = [], verify, streams = candidates.slice(0, 2) }) {
    const checks = new Map();
    const result = resolvePlayback(request, { ...base, preferredAudioLanguage: preferred,
        fetchStreams: async () => streams,
        inspectStream: async candidate => metadata[streams.indexOf(candidate)] ?? undefined,
        verifyStream(candidate, options) {
            const d = deferred();
            const item = { ...d, options, candidate, selected: undefined };
            checks.set(candidate.url, item);
            verify?.(item);
            return d.promise;
        },
    }, () => {});
    await flush();
    return { result, checks, finish: () => flush(), timers };
}
function langMetadata(language, extra = {}) {
    return { audio: [{ language, primary: true, ...extra }] };
}
function resolve(checks, index, status = 'supported') { checks.get(candidates[index].url).resolve(status); }

(async () => {
    // Filename labels remain useful when container language metadata is absent.
    {
        const streams = [{ ...candidates[0], title: 'Russian 1080p H264 AAC' }, { ...candidates[1], title: 'English 1080p H264 AAC' }];
        const run = await selector({ streams });
        resolve(run.checks, 0); await flush();
        let settled = false; run.result.then(() => { settled = true; }); await flush();
        assert.equal(settled, false, 'A Russian-labeled stream must not outrun a pending English-labeled stream');
        resolve(run.checks, 1); assert.equal((await run.result).streamUrl, candidates[1].url);
    }
    // A known mismatch must not beat a slower, known preferred-language stream.
    {
        const run = await selector({ metadata: [langMetadata('ru'), langMetadata('en')] });
        resolve(run.checks, 0); await flush();
        let settled = false; run.result.then(() => { settled = true; }); await flush();
        assert.equal(settled, false, 'Russian metadata/default/label cannot win before English verification');
        resolve(run.checks, 1); assert.equal((await run.result).streamUrl, candidates[1].url);
    }
    // A known mismatch waits for unknown metadata, which can prove preferred language.
    {
        const run = await selector({ metadata: [langMetadata('ru'), undefined] });
        resolve(run.checks, 0); await flush();
        let settled = false; run.result.then(() => { settled = true; }); await flush(); assert.equal(settled, false);
        run.checks.get(candidates[1].url).options.onAudioLanguage?.('en');
        resolve(run.checks, 1); assert.equal((await run.result).streamUrl, candidates[1].url);
    }
    // An early proof cannot abort another probe while its language is still unknown.
    {
        let early;
        const run = await selector({ metadata: [undefined, langMetadata('en')], verify: item => { if (item.candidate === candidates[0]) early = item; } });
        early.options.onAudioLanguage?.('en'); resolve(run.checks, 0);
        await flush(); assert.equal(run.checks.get(candidates[1].url).options.signal.aborted, false);
        resolve(run.checks, 1); await run.result;
    }
    // A fast decoder result must keep metadata alive until its real default language is known.
    {
        const delayed = deferred();
        const run = await selector({ metadata: [delayed.promise, langMetadata('en')] });
        resolve(run.checks, 0); await flush();
        assert.equal(run.checks.get(candidates[0].url).options.signal.aborted, false);
        delayed.resolve(langMetadata('ru')); resolve(run.checks, 1);
        assert.equal((await run.result).streamUrl, candidates[1].url);
    }
    {
        const delayed = deferred();
        const streams = [{ ...candidates[0], title: 'Russian H264 AAC' }, { ...candidates[1], title: 'Russian H264 AAC' }];
        const run = await selector({ streams, metadata: [langMetadata('ru'), delayed.promise] });
        resolve(run.checks, 0); await flush();
        let settled = false; run.result.then(() => { settled = true; }); await flush();
        assert.equal(settled, false, 'Other-language labels alone do not prove that every pending stream lacks preferred audio');
        delayed.resolve(langMetadata('en')); resolve(run.checks, 1);
        assert.equal((await run.result).streamUrl, candidates[1].url);
    }
    // Unknown/unlabeled fast result cannot beat known English still being checked.
    {
        const run = await selector({ metadata: [undefined, langMetadata('en')] });
        resolve(run.checks, 0); await flush(); let settled = false; run.result.then(() => { settled = true; }); await flush();
        assert.equal(settled, false); resolve(run.checks, 1); assert.equal((await run.result).streamUrl, candidates[1].url);
    }
    // Desired language is input, not a hard-coded English preference.
    for (const desired of ['es', 'fr']) {
        const run = await selector({ preferred: desired, metadata: [langMetadata('en'), langMetadata(desired)] });
        resolve(run.checks, 0); await flush(); let settled = false; run.result.then(() => { settled = true; }); await flush();
        assert.equal(settled, false); resolve(run.checks, 1); assert.equal((await run.result).streamUrl, candidates[1].url);
    }
    // Mismatch fallback is only legal after all viable preferred alternatives fail.
    {
        const run = await selector({ metadata: [langMetadata('ru'), langMetadata('en')] });
        resolve(run.checks, 1, 'unsupported'); await flush(); resolve(run.checks, 0);
        assert.equal((await run.result).streamUrl, candidates[0].url);
    }
    // If there is no preferred-language match, a verified mismatch may be used.
    {
        const run = await selector({ metadata: [langMetadata('ru'), langMetadata('fr')] });
        resolve(run.checks, 0); await flush();
        assert.equal((await run.result).streamUrl, candidates[0].url, 'Do not wait for another confirmed nonmatching language');
        resolve(run.checks, 1); await flush();
    }
    // A RU-primary/EN-alternate declaration is not proof of selected English;
    // an explicit decoder callback is proof and promotes it.
    {
        const dual = { audio: [{ language: 'ru', primary: true }, { language: 'en', primary: false }] };
        const run = await selector({ metadata: [dual, langMetadata('en')] });
        resolve(run.checks, 0); await flush(); let settled = false; run.result.then(() => { settled = true; }); await flush();
        assert.equal(settled, false);
        run.checks.get(candidates[1].url).options.onAudioLanguage?.('en'); resolve(run.checks, 1);
        assert.equal((await run.result).streamUrl, candidates[1].url);
    }
    // Actual selected-language evidence overrides a misleading default/label.
    {
        const run = await selector({ metadata: [langMetadata('en'), langMetadata('en')] });
        run.checks.get(candidates[0].url).options.onAudioLanguage?.('ru');
        resolve(run.checks, 0); await flush(); let settled = false; run.result.then(() => { settled = true; }); await flush();
        assert.equal(settled, false, 'Decoder-selected Russian overrides false English metadata');
        run.checks.get(candidates[1].url).options.onAudioLanguage?.('en'); resolve(run.checks, 1);
        assert.equal((await run.result).streamUrl, candidates[1].url);
    }
    {
        const dual = { audio: [{ language: 'ru', primary: true }, { language: 'en', primary: false }] };
        const run = await selector({ metadata: [dual, langMetadata('ru')] });
        run.checks.get(candidates[0].url).options.onAudioLanguage('eng'); resolve(run.checks, 0);
        assert.equal((await run.result).streamUrl, candidates[0].url, 'An actually selected English alternate overrides the Russian default');
        resolve(run.checks, 1, 'unsupported'); await flush();
    }
    // Include all provider results in the decision; a late preferred candidate
    // must beat earlier verified mismatches, even when it arrives progressively.
    {
        const run = await selector({ streams: candidates.slice(0, 6), metadata: [langMetadata('ru'), langMetadata('ru'), langMetadata('ru'), langMetadata('ru'), langMetadata('ru'), langMetadata('en')] });
        for (let i = 0; i < 5; i++) resolve(run.checks, i);
        await flush(); let settled = false; run.result.then(() => { settled = true; }); await flush(); assert.equal(settled, false);
        resolve(run.checks, 5); assert.equal((await run.result).streamUrl, candidates[5].url);
    }
    // The 45-second deadline must preserve a verified fallback rather than discard it.
    {
        const run = await selector({ metadata: [langMetadata('ru'), langMetadata('en')] });
        resolve(run.checks, 0); await flush();
        [...timers.values()].find(timer => timer.ms === 45000).fn();
        assert.equal((await run.result).streamUrl, candidates[0].url);
        assert.equal(run.checks.get(candidates[1].url).options.signal.aborted, true);
        resolve(run.checks, 1, 'unknown'); await flush();
    }
    {
        const delayed = deferred();
        const run = await selector({ metadata: [delayed.promise, langMetadata('en')] });
        resolve(run.checks, 0); await flush();
        [...timers.values()].find(timer => timer.ms === 45000).fn();
        assert.equal((await run.result).streamUrl, candidates[0].url, 'Retain proven A/V even if language metadata is still inconclusive at the deadline');
        delayed.resolve(langMetadata('ru')); resolve(run.checks, 1, 'unknown'); await flush();
    }
    assert.equal(timers.size, 0, 'Selector must clear controlled timers');
    console.log('PASS: preferred-language ranking, selected-language evidence, and verified fallback scenarios.');
})().catch(error => { console.error(error); process.exitCode = 1; });
