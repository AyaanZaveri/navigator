const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, globals) {
    const context = { exports: {}, URL, URLSearchParams, Request, Response, AbortSignal, ...globals };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText, context);
    return context.exports;
}
(async () => {
    const calls = [];
    let authorized = true;
    const episode = { id: 'tt1442437:8:16', title: 'Basketball', season: 8, episode: 16 };
    const { GET } = load('app/api/playback/episode/route.ts', { require(name) {
        if (name === '@/app/actions/auth') return { getAuthData: async () => { if (!authorized) throw new Error('Not authenticated'); } };
        if (name === '@/app/actions/tv-shows') return { fetchEpisodeDetails: async (...args) => { calls.push(args); return episode; } };
        throw new Error(name);
    } });
    const request = params => new Request('http://localhost:3000/api/playback/episode?' + params);
    for (const params of ['id=https://bad.test&season=8&episode=16', 'id=tt1442437&episode=16',
        'id=tt1442437&season=8&episode=0', 'id=tt1442437&season=8.5&episode=16']) {
        assert.equal((await GET(request(params))).status, 400);
    }
    assert.equal(calls.length, 0);
    authorized = false;
    assert.equal((await GET(request('id=tt1442437&season=8&episode=16'))).status, 401);
    assert.equal(calls.length, 0);
    authorized = true;
    const response = await GET(request('id=tt1442437&season=8&episode=16'));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    assert.deepEqual((await response.json()).episode, episode);
    assert.deepEqual(calls[0].slice(0, 3), ['tt1442437', 8, 16]);
    assert.ok(calls[0][3] instanceof AbortSignal, 'Request cancellation reaches metadata lookup');
    const requests = [];
    const { fetchPlaybackEpisode } = load('lib/media/fetch-playback-episode.ts', { fetch: async (url, options) => {
        requests.push({ url, options }); return Response.json({ episode });
    } });
    const controller = new AbortController();
    assert.equal((await fetchPlaybackEpisode('tt1442437', 8, 16, controller.signal)).title, 'Basketball');
    assert.ok(requests[0].url.startsWith('/api/playback/episode?'));
    assert.equal(new URL(requests[0].url, 'http://localhost:3000').searchParams.get('episode'), '16');
    controller.abort();
    assert.equal(requests[0].options.signal.aborted, true);
    console.log('PASS: independent authenticated episode reads, bounded target validation, private responses, and cancellation.');
})().catch(error => { console.error(error); process.exitCode = 1; });
