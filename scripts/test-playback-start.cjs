const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/media/resolve-playback.ts', 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, context);
const { resolvePlayback, playbackPhaseLabels } = context.exports;
async function test() {
    const phases = [], calls = [];
    const deps = {
        async fetchStreams(id, type) {
            calls.push([id, type]);
            return [{ infoHash: 'torrent-only' }, { url: 'https://example.test/top.mkv', behaviorHints: {
                filename: 'Top.mkv', videoSize: 123, proxyHeaders: { request: { Referer: 'https://example.test' } },
            } }, { url: 'https://example.test/lower.mp4' }];
        },
        async getNextEpisodeForSeries(id) {
            calls.push(['episode', id]);
            return { id: 'show:1:2', title: 'Second episode', season: 1, episode: 2, resumePositionTicks: 42 };
        },
    };
    const movie = await resolvePlayback({ id: 'movie', name: 'Movie', type: 'movie' }, deps, phase => phases.push(phase));
    assert.equal(movie.streamUrl, 'https://example.test/top.mkv');
    assert.equal(movie.requestHeaders.Referer, 'https://example.test');
    assert.equal(movie.subtitleFilename, 'Top.mkv');
    assert.equal(movie.subtitleVideoSize, 123);
    assert.deepEqual(phases, ['fetching-streams', 'loading-stream']);
    assert.deepEqual(calls, [['movie', 'movie']]);
    calls.length = phases.length = 0;
    const episode = await resolvePlayback({ id: 'show', name: 'Show', type: 'series', mediaSourceId: 'show:2:3', resumePositionTicks: 15 }, deps, phase => phases.push(phase));
    assert.deepEqual(calls, [['show:2:3', 'series']], 'Explicit episode Play must fetch that episode, not the series or first episode');
    assert.equal(episode.resumePositionTicks, 15);
    calls.length = phases.length = 0;
    const show = await resolvePlayback({ id: 'show', name: 'Show', type: 'series' }, deps, phase => phases.push(phase));
    assert.deepEqual(calls, [['episode', 'show'], ['show:1:2', 'series']]);
    assert.equal(show.showName, 'Show');
    assert.equal(show.episodeTitle, 'Second episode');
    assert.equal(show.resumePositionTicks, 42);
    assert.deepEqual(phases, ['finding-episode', 'fetching-streams', 'loading-stream']);
    calls.length = phases.length = 0;
    const direct = await resolvePlayback({ ...movie, streamUrl: 'https://example.test/chosen.mp4' }, deps, phase => phases.push(phase));
    assert.equal(direct.streamUrl, 'https://example.test/chosen.mp4');
    assert.deepEqual(calls, [], 'A manually chosen stream must not trigger source selection');
    assert.deepEqual(phases, ['loading-stream']);
    await assert.rejects(resolvePlayback({ id: 'empty', name: 'Empty', type: 'movie' }, { ...deps, fetchStreams: async () => [] }, () => {}), /No playable streams found/);
    assert.equal(playbackPhaseLabels['fetching-streams'], 'Fetching streams…');
    assert.equal(playbackPhaseLabels['loading-stream'], 'Loading stream…');
    console.log('PASS: movie/episode/show Play selects the first playable source in order, preserves headers and resume data, respects manual sources, and reports accurate phases.');
}
test().catch(error => { console.error(error); process.exitCode = 1; });
