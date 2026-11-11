const assert = require('node:assert/strict');
const { load } = require('./test-support/react-hooks.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const requests = [];
const dependencies = { 'server-only': {}, '@/lib/tmdb-credentials': { getTMDBToken: async () => 'fixture' } };
const { getTMDBPageContext } = load('lib/tmdb-discovery.ts', {
    ...dependencies,
}, { URLSearchParams, fetch: async url => {
    const parsed = new URL(url); const path = parsed.pathname; requests.push(path);
    if (path.includes('/find/')) return Response.json({ tv_results: [{ id: 42 }] });
    if (path.endsWith('/episode/3')) return Response.json({ name: 'Episode name', still_path: null });
    return Response.json({ id: 42, name: 'Show name' });
} });
(async () => {
    const result = await getTMDBPageContext({ id: 'tt123', type: 'series', season: 2, episode: 3 });
    assert.equal(result.episodeTitle, 'Episode name'); assert.equal(result.name, 'Show name');
    assert.equal(requests.filter(path => path.includes('/find/')).length, 1);
    assert.ok(!requests.some(path => /\/season\/2$/.test(path)), 'No season enumeration');

    let titleResolve, episodeResolve;
    const started = [];
    const parallel = load('lib/tmdb-discovery.ts', dependencies, { URLSearchParams,
        fetch: url => { const episode = url.includes('/episode/'); started.push(episode ? 'episode' : 'title'); return new Promise(resolve => { if (episode) episodeResolve = resolve; else titleResolve = resolve; }); },
    });
    const work = parallel.getTMDBPageContext({ id: 'tmdb:42', type: 'series', season: 2, episode: 3 });
    await tick(); assert.deepEqual(started.sort(), ['episode', 'title']);
    episodeResolve(new Response('unavailable', { status: 503 })); titleResolve(Response.json({ id: 42, name: 'Still useful' }));
    assert.equal((await work).name, 'Still useful', 'Episode failure retains title context');
    const abort = new AbortController(); abort.abort();
    await assert.rejects(parallel.getTMDBPageContext({ id: 'tmdb:42', type: 'movie' }, abort.signal));
    console.log('PASS: one canonical lookup, concurrent narrow title/episode requests, correct episode name, isolated failures and cancellation');
})().catch(error => { console.error(error); process.exitCode = 1; });
