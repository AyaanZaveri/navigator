const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

async function main() {
    const ai = await import('ai');
    const zod = await import('zod');
    const modules = new Map();
    const jar = new Map();
    let signedIn = true;
    let status = 200;
    let fetchBody;
    const requests = [];
    const prompts = [];
    let mode = 'web';
    const env = { TINYFISH_API_KEY: 'server-key', NODE_ENV: 'production', NAVIGATOR_DESKTOP: '1', HOSTNAME: '127.0.0.1' };
    const episodes = [
        ...Array.from({ length: 44 }, (_, index) => ({ id: `tmdb:58957:1:${index + 1}`, title: `Early episode ${index + 1}`, name: `Early episode ${index + 1}`, season: 1, episode: index + 1 })),
        { id: 'tmdb:58957:4:4', name: 'The Anecdote', title: 'The Anecdote', season: 4, episode: 4, overview: 'Nathan hones his storytelling skills.' },
        { id: 'tmdb:58957:4:7', name: 'Finding Frances', title: 'Finding Frances', season: 4, episode: 7, overview: 'A Bill Gates impersonator finds his long-lost love.' },
    ];
    let extraOverview = '';
    const source = { id: 'web:1', title: 'Episode guide', url: 'https://example.com/guide', text: 'S4E5: The Anecdote. Nathan prepares an anecdote for Jimmy Kimmel Live.' };
    const overrides = {
        'server-only': {},
        ai: { ...ai, generateText: async options => {
            prompts.push(options.prompt);
            const isWeb = options.prompt.includes('web:1');
            const eligible = options.prompt.split('Evidence sources:')[0].includes('tmdb:58957:4:4');
            if (mode === 'fake') return { output: { status: 'matched', evidence: [{ episodeId: 'tmdb:58957:4:4', sourceId: 'web:1', quote: 'a fabricated quote' }] } };
            if (mode === 'wrong-id') return { output: { status: 'matched', evidence: [{ episodeId: 'tmdb:58957:4:5', sourceId: 'web:1', quote: source.text }] } };
            if (mode === 'ambiguous' && isWeb) return { output: { status: 'ambiguous', evidence: [
                { episodeId: 'tmdb:58957:4:4', sourceId: 'web:1', quote: source.text },
                { episodeId: 'tmdb:58957:4:7', sourceId: 'web:1', quote: source.text },
            ] } };
            if (mode === 'late-clue' && eligible) return { output: { status: 'matched', evidence: [{ episodeId: 'tmdb:58957:4:4', sourceId: 'tmdb:58957:4:4', quote: extraOverview }] } };
            return { output: { status: isWeb && eligible && mode !== 'none' ? 'matched' : 'not_found', evidence: isWeb && eligible && mode !== 'none'
                ? [{ episodeId: 'tmdb:58957:4:4', sourceId: source.id, quote: source.text }] : [] } };
        } },
        zod,
        'next/headers': { cookies: async () => ({ get: key => jar.get(key), set: (key, value, options) => jar.set(key, { value, options }), delete: key => jar.delete(key) }) },
        '@/app/actions/auth': { getUser: async () => signedIn ? { _id: 'test' } : null },
        '@/lib/tmdb-discovery': {
            getTMDBTitle: async () => ({ id: 'tmdb:58957', name: 'Nathan for You', poster: 'https://image.tmdb.org/t/p/w500/show.jpg', year: 2013, genres: ['Comedy'], communityRating: 8.1 }),
            searchTMDBMedia: async () => ({ results: [{ id: 'tmdb:58957', name: 'Nathan for You' }] }),
            getTMDBSeasons: async () => [{ number: 1 }, { number: 4 }],
            getTMDBEpisodes: async (_, season) => episodes.filter(e => e.season === season).map(e => ({ ...e, overview: e.overview + (e.episode === 4 && e.season === 4 ? extraOverview : '') })),
            mapTMDBSeasons: async (seasons, load, signal) => { signal?.throwIfAborted(); return Promise.all(seasons.map(load)); },
        },
    };
    function load(file) {
        const absolute = path.resolve(file);
        if (modules.has(absolute)) return modules.get(absolute).exports;
        const module = { exports: {} }; modules.set(absolute, module);
        const context = { module, exports: module.exports, process: { env }, console, URL, URLSearchParams, AbortSignal, AbortController,
            fetch: async (url, init) => { requests.push({ url, init }); return new Response(JSON.stringify(typeof fetchBody === 'function' ? fetchBody(url) : fetchBody || { results: [{ title: 'Guide', url: 'https://example.com/guide' }] }), { status }); },
            require: name => overrides[name] || (name.startsWith('@/') ? load(name.slice(2) + '.ts') : require(name)),
        };
        vm.runInNewContext(ts.transpileModule(fs.readFileSync(absolute, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context, { filename: absolute });
        return module.exports;
    }
    const { resolveEpisode } = load('lib/episode-discovery.ts');
    const input = { seriesQuery: 'Nathan for You', episodeQuery: 'where he goes on Jimmy Kimmel' };
    let webCalls = 0;
    const research = async () => { webCalls++; return [source]; };
    const progress = [];
    let result = await resolveEpisode(input, { model: { modelId: 'mock', provider: 'mock' }, research, onProgress: value => progress.push(value) });
    const catalog = progress.find(value => value.stage === 'episodes' && value.state === 'completed').catalog;
    assert.equal(catalog.poster, 'https://image.tmdb.org/t/p/w500/show.jpg', 'The metadata card receives the resolved show poster');
    assert.equal(catalog.year, 2013);
    assert.equal(catalog.communityRating, 8.1);
    assert.equal(catalog.genres[0], 'Comedy');
    assert.equal(result.status, 'matched');
    assert.equal(result.episodes[0].id, 'tmdb:58957:4:4', 'Map identity/title to TMDB, not the external S4E5');
    assert.equal(webCalls, 1);
    assert.ok(prompts.some(prompt => prompt.includes('Early episode 44')), 'Episodes beyond the first 40 must be assessed');
    assert.ok(!result.episodes.some(ep => ep.id.endsWith(':4:7')), 'Finding Frances must never be a filler candidate');
    result = await resolveEpisode(input, { model: { modelId: 'mock', provider: 'mock' } });
    assert.equal(result.success, false);
    assert.equal(result.episodes.length, 0, 'No-score ties must not return the earliest ten episodes');
    assert.match(result.message, /Settings/);
    extraOverview = 'x'.repeat(350) + ' Jimmy Kimmel appears in this episode.';
    mode = 'late-clue';
    result = await resolveEpisode(input, { model: { modelId: 'mock', provider: 'mock' }, research });
    assert.equal(result.status, 'matched');
    assert.equal(webCalls, 1, 'A supported metadata match must not search the web');
    extraOverview = '';
    for (mode of ['fake', 'wrong-id', 'none']) {
        result = await resolveEpisode(input, { model: { modelId: 'mock', provider: 'mock' }, research });
        assert.equal(result.success, false, `Reject ${mode} evidence`);
    }
    mode = 'ambiguous';
    result = await resolveEpisode(input, { model: { modelId: 'mock', provider: 'mock' }, research });
    assert.equal(result.status, 'ambiguous'); assert.equal(result.success, false);
    const calls = webCalls;
    result = await resolveEpisode({ ...input, episodeQuery: 'The Anecdote', seasonNumber: 4 }, { research });
    assert.equal(result.status, 'matched'); assert.equal(webCalls, calls, 'Exact titles need no model or web search');
    const controller = new AbortController(); controller.abort();
    await assert.rejects(resolveEpisode(input, { signal: controller.signal }), /abort/i);

    const tinyfish = load('lib/tinyfish.ts');
    const settings = load('app/actions/web-search-settings.ts');
    const credentials = load('lib/tinyfish-credentials.ts');
    assert.equal((await settings.getWebSearchSettings()).configured, true);
    assert.ok(!JSON.stringify(await settings.getWebSearchSettings()).includes('server-key'));
    assert.equal((await settings.saveWebSearchKey('bad\r\nheader')).success, false);
    assert.equal(requests.length, 0);
    assert.equal((await settings.saveWebSearchKey(' personal-key ')).success, true);
    assert.equal((await credentials.getTinyfishConfig()).apiKey, 'personal-key');
    assert.equal(jar.get(credentials.TINYFISH_KEY_COOKIE).options.httpOnly, true);
    assert.equal(jar.get(credentials.TINYFISH_KEY_COOKIE).options.secure, false);
    assert.equal(requests[0].init.headers['X-API-Key'], 'personal-key');
    assert.ok(!requests[0].url.includes('personal-key'));
    assert.ok(new URL(requests[0].url).searchParams.get('purpose'));
    status = 401;
    assert.equal((await settings.saveWebSearchKey('rejected')).success, false);
    assert.equal((await credentials.getTinyfishConfig()).apiKey, 'personal-key', 'Failed replacement retains working key');
    status = 200;
    await settings.setWebSearchEnabled(false);
    assert.equal((await credentials.getTinyfishConfig()).enabled, false);
    await settings.removeWebSearchKey();
    assert.equal((await credentials.getTinyfishConfig()).apiKey, 'server-key');
    signedIn = false;
    assert.equal((await settings.saveWebSearchKey('no')).success, false);
    assert.equal((await settings.setWebSearchEnabled(true)).success, false);
    await assert.rejects(settings.getWebSearchSettings(), /Sign in/);
    signedIn = true;
    fetchBody = { results: [{ title: 'Private', url: 'https://127.0.0.1/private' }, { title: 'Guide', url: 'https://example.com/guide' }] };
    const search = await tinyfish.searchTinyfish('query', 'purpose', 'key');
    assert.equal(search.length, 1);
    fetchBody = url => url.includes('api.search.') ? { results: [{ title: 'Good', url: 'https://example.com/good' }, { title: 'Bad', url: 'https://example.com/bad' }] }
        : { results: [{ url: 'https://example.com/good', title: 'Guide', text: 'The Anecdote features Jimmy Kimmel.' }], errors: [{ url: 'https://example.com/bad', error: 'timeout', status: 504 }] };
    const partial = await tinyfish.researchMediaWeb('Jimmy Kimmel', 'Find the episode', 'key');
    assert.equal(partial.length, 1, 'Successful source survives a sibling failure');
    const fetchRequest = requests.findLast(request => request.url === 'https://api.fetch.tinyfish.ai/');
    assert.equal(JSON.parse(fetchRequest.init.body).urls.length, 2);
    assert.equal(JSON.parse(fetchRequest.init.body).highlights, undefined, 'No account-gated highlights dependency');
    fetchBody = url => url.includes('api.search.') ? { results: [{ title: 'Bad', url: 'https://example.com/bad' }] }
        : { results: [], errors: [{ url: 'https://example.com/bad', error: 'blocked' }] };
    await assert.rejects(tinyfish.researchMediaWeb('Jimmy Kimmel', 'Find the episode', 'key'), /could not read/);
    const longText = 'Unrelated introduction.\n'.repeat(1000) + 'The Anecdote: Jimmy Kimmel Live is the key clue.';
    assert.ok(tinyfish.webPassages(longText, 'Jimmy Kimmel').includes('The Anecdote: Jimmy Kimmel'));
    assert.ok(tinyfish.webPassages(longText, 'Jimmy Kimmel').length < longText.length);
    console.log('PASS: evidence-backed episode identity, full catalogs/overviews, ambiguity/no-match, cancellation, TinyFish credentials and optional search.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
