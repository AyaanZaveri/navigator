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
        require: name => name === '@/lib/artwork' ? artwork : name === '@/lib/media/shuffle-episode' ? load('lib/media/shuffle-episode.ts') : name === '@/lib/tmdb-discovery' ? {
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
    assert.equal((await context.exports.getFollowingEpisodeForSeries('tt123', 1, 1)).id, 'tt123:1:2');
    assert.equal((await context.exports.getFollowingEpisodeForSeries('tt123', 1, 2)).id, 'tt123:2:1', 'Advance across seasons');
    assert.equal(await context.exports.getFollowingEpisodeForSeries('tt123', 2, 1), null, 'Last episode has no next button');
    assert.equal((await context.exports.getFollowingEpisodeForSeries('tt123', 0, 1)).id, 'tt123:1:1', 'Specials advance to regular seasons');
    assert.ok((await context.exports.getRandomEpisodeForSeries('tt123')).season > 0, 'Server shuffle also excludes specials');
    videos = [videos[0]];
    assert.equal(await context.exports.getNextEpisodeForSeries('tt123'), null, 'Never auto-start a special');
    assert.equal(await context.exports.getRandomEpisodeForSeries('tt123'), null, 'Shuffle cannot substitute a special when no regular episodes exist');
    assert.equal((await context.exports.getNextEpisodeForSeries('tmdb:123')).id, 'tmdb:123:1:1');

    const atoms = load('lib/atoms.ts', name => name === 'jotai'
        ? { atom: (initial, write) => ({ initial, write }) }
        : name === '@/lib/media/playback-context' ? require('./test-support/playback-context.cjs') : name === '@/lib/desktop/bridge' ? { recordDesktopStage() {} } : artwork);
    const updates = new Map();
    const play = request => atoms.playMediaAtom.write(() => {}, (key, value) => updates.set(key, value), request);
    play({ id: 'tt123', type: 'series', mediaSourceId: 'tt123:0:1', backdropUrl: '/episode-still.jpg' });
    const episode = updates.get(atoms.currentMediaAtom);
    assert.equal(episode.backdropUrl, artwork.artworkUrl('tt123', 'series', 'backdrop'));
    assert.equal(episode.mediaSourceId, 'tt123:0:1', 'Explicitly selected specials remain playable');
    play({ id: 'movie', type: 'movie', backdropUrl: '/movie.jpg' });
    assert.equal(updates.get(atoms.currentMediaAtom).backdropUrl, '/movie.jpg');
    let played, stopped = false, slot = 0;
    const { PlayerNextEpisode } = load('components/player-next-episode.tsx', name => {
        if (name === 'react') return {
            useEffect() {},
            useState: () => [slot++ === 0 ? { id: 'tt123:2:1', title: 'Next season', season: 2, episode: 1 } : false, () => {}],
        };
        if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
        if (name === '@/contexts/MediaPlayerContext') return { usePlaybackActions: () => ({ playMedia: media => {
            assert.ok(stopped, 'Report previous playback before starting the next episode');
            played = media;
        } }) };
        return new Proxy({}, { get: (_, key) => key });
    });
    const nextButton = PlayerNextEpisode({
        media: { id: 'tt123', type: 'series', showName: 'Show', streamUrl: 'https://old-stream.test', resumePositionTicks: 40 },
        season: 1, episode: 2, onAdvance: () => { stopped = true; },
    }).props.children;
    assert.equal(nextButton.props.children[1], 'Next episode', 'Advancing is discoverable without an icon tooltip on touch');
    nextButton.props.onClick();
    assert.equal(played.mediaSourceId, 'tt123:2:1');
    assert.equal(played.showName, 'Show');
    assert.equal(played.streamUrl, undefined, 'Fetch a new stream for the next episode');
    assert.equal(played.resumePositionTicks, undefined, 'Do not carry the previous episode position');
    console.log('PASS: series Play starts S1E1, skips specials, and episode playback uses the show backdrop.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
