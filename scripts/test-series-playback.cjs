const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, require) {
    const context = { exports: {}, require, URLSearchParams, AbortSignal, console };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText, context);
    return context.exports;
}

async function run() {
    const artwork = load('lib/artwork.ts');
    let videos = [
        { id: 'tt123:0:1', season: 0, episode: 1, title: 'Special' },
        { id: 'tt123:2:1', season: 2, episode: 1 },
        { id: 'tt123:1:2', season: 1, episode: 2 },
        { id: 'tt123:1:1', season: 1, episode: 1, title: 'Pilot' },
    ];
    const context = { exports: {}, URLSearchParams, AbortSignal, console,
        fetch: async () => ({ ok: true, json: async () => ({ meta: { videos } }) }),
        require: name => name === '@/lib/artwork' ? artwork : name === '@/lib/tmdb-discovery' ? {
            getTMDBEpisodes: async (id, season) => {
                assert.equal(season, 1);
                return [{ id: `${id}:1:2`, season: 1, episode: 2 }, { id: `${id}:1:1`, season: 1, episode: 1 }];
            },
        } : {
            getAuthData: async () => ({}),
            getInstalledAddons: async () => [{ transportUrl: 'https://addon.test/manifest.json', manifest: { resources: ['meta'] } }],
        },
    };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/actions/tv-shows.ts', 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText, context);
    assert.equal((await context.exports.getNextEpisodeForSeries('tt123')).id, 'tt123:1:1');
    videos = [videos[0]];
    assert.equal(await context.exports.getNextEpisodeForSeries('tt123'), null, 'Never auto-start a special');
    assert.equal((await context.exports.getNextEpisodeForSeries('tmdb:123')).id, 'tmdb:123:1:1');

    const atoms = load('lib/atoms.ts', name => name === 'jotai'
        ? { atom: (initial, write) => ({ initial, write }) } : artwork);
    const updates = new Map();
    const play = request => atoms.playMediaAtom.write(() => {}, (key, value) => updates.set(key, value), request);
    play({ id: 'tt123', type: 'series', mediaSourceId: 'tt123:0:1', backdropUrl: '/episode-still.jpg' });
    const episode = updates.get(atoms.currentMediaAtom);
    assert.equal(episode.backdropUrl, artwork.artworkUrl('tt123', 'series', 'backdrop'));
    assert.equal(episode.mediaSourceId, 'tt123:0:1', 'Explicitly selected specials remain playable');
    play({ id: 'movie', type: 'movie', backdropUrl: '/movie.jpg' });
    assert.equal(updates.get(atoms.currentMediaAtom).backdropUrl, '/movie.jpg');
    console.log('PASS: series Play starts S1E1, skips specials, and episode playback uses the show backdrop.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
