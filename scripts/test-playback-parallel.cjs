const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function languageRequire(name) {
    if (name === '@/lib/artwork') return utility('lib/artwork.ts');
    if (name === '@/lib/series-route') return utility('lib/series-route.ts');
    if (name !== '@/lib/media/audio-language') return require(name);
    const context = { exports: {}, require: languageRequire };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/media/audio-language.ts', 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText, context);
    return context.exports;
}

const React = require('react');
function transpile(file) {
    return ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        fileName: file,
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText;
}
function utility(file) {
    const context = { exports: {}, require: languageRequire };
    vm.runInNewContext(transpile(file), context);
    return context.exports;
}
const callbacks = [], changes = [], requests = [];
const ordinarySeries = process.argv.includes("--series");
const onPage = process.argv.includes("--page");
const provided = process.argv.includes("--provided") || onPage;
const canonical = process.argv.includes("--canonical") || ordinarySeries || provided;
const expectedTitle = provided ? 'Provided episode title' : canonical ? 'Canonical episode title' : 'Early episode title';
let finishDetails, finishStreams;
const details = new Promise(resolve => { finishDetails = resolve; });
const streams = new Promise(resolve => { finishStreams = resolve; });
const request = { id: 'show', type: 'series', name: canonical ? 'Episode 3' : 'Show', episodeTitle: canonical ? 'Episode 3' : undefined, showName: 'Show', mediaSourceId: 'show:1:3', seasonNumber: 1, episodeNumber: 3 };
if (ordinarySeries) { delete request.mediaSourceId; delete request.seasonNumber; delete request.episodeNumber; delete request.episodeTitle; request.name = 'Show'; }
if (provided) request.episodeTitle = 'Provided episode title';
if (onPage) {
    request.detailsLoaded = true;
    request.details = { id: 'show', type: 'series', name: 'Show', year: 2009, runtime: '21 min', imdbRating: '8.5', logo: '/logo.svg' };
    request.streamRequest = { id: 'show:1:3', type: 'series', canonicalId: Promise.resolve('show:1:3'), promise: streams };
}
const noOp = () => {};
const hooks = {
    ...React,
    useState: initial => [initial, value => changes.push(value)],
    useRef: initial => ({ current: initial }),
    useEffect: noOp,
    useLayoutEffect: noOp,
    useCallback: callback => { callbacks.push(callback); return callback; },
};
const context = { exports: {}, AbortController, console, require(name) {
    if (name === 'next/navigation') return { useRouter: () => ({ push: noOp }) };
    if (name === 'react') return hooks;
    if (name === 'sonner') return { toast: Object.assign(noOp, { dismiss: noOp, error: noOp }) };
    if (name.endsWith('.css')) return {};
    if (name === '@/contexts/MediaPlayerContext') return { useMediaPlayer: () => ({ currentMedia: request, isPlayerVisible: false, setCurrentMediaWithSource: noOp }) };
    if (name === '@/contexts/settings-context') return { useSettings: () => ({}) };
    if (name === '@/lib/media/subtitle-timing') return { useSubtitleTiming: () => ({ key: null, seconds: 0, onChange: noOp }), subtitleTime: time => time };
    if (name === '@/lib/media/resolve-playback') return utility('lib/media/resolve-playback.ts');
    if (name === '@/lib/media/playback-titles') return utility('lib/media/playback-titles.ts');
    if (name === '@/lib/media/fetch-playback-streams') return { fetchPlaybackStreams() { requests.push('streams'); return streams; } };
    if (name === '@/app/actions') return { fetchMediaDetails() { throw Error('Player metadata must not queue a Server Action'); } };
    if (name === '@/lib/media/fetch-playback-details') return { fetchPlaybackDetails(_media, signal) { assert.ok(signal); requests.push('details'); return details; } };
    if (name === '@/lib/media/playback-details') return utility('lib/media/playback-details.ts');
    if (name === '@/lib/media/fetch-playback-episode') return { fetchPlaybackEpisode: async (id, season, episode) => {
        assert.equal(provided, false, 'Known episode-page titles need no extra lookup');
        assert.equal(id, 'show');
        assert.equal(season, 1);
        assert.equal(episode, ordinarySeries ? 1 : 3);
        requests.push('episode-http');
        return canonical ? { id: ordinarySeries ? 'show:1:1' : 'show:1:3', title: 'Canonical episode title', season: 1, episode: ordinarySeries ? 1 : 3 } : null;
    } };
    if (name === '@/app/actions/tv-shows') return { fetchEpisodeDetails: () => { throw new Error('Client must not queue episode Server Actions'); } };
    if (name === '@/app/actions/utils') return { getSubtitleTracks: async () => [] };
    if (name.startsWith('@/') || name === '@mux/mux-video-react') return new Proxy({}, { get: () => noOp });
    return require(name);
} };
vm.runInNewContext(transpile('components/global-media-player.tsx'), context);
context.exports.GlobalMediaPlayer({});
const load = callbacks.find(callback => callback.toString().includes('fetchPlaybackStreams'));
assert.ok(load, 'Exercise the actual player loading callback');
(async () => {
    const pending = load(request);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(requests, onPage ? [] : provided ? ['details', 'streams'] : ordinarySeries ? ['details', 'episode-http', 'streams'] : ['episode-http', 'details', 'streams'], 'Only the selected episode is fetched, independently of pending stream and show requests');
    finishDetails({ id: 'show', type: 'series', name: 'Show', year: 2009, runtime: '21 min', imdbRating: '8.5', logo: '/logo.svg', poster: '/poster.jpg', background: '/backdrop.jpg', cast: ['Actor'], videos: [{ id: 'show:1:3', title: 'Early episode title', season: 1, episode: 3 }] });
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(changes.some(value => value?.media?.episodeTitle === expectedTitle), 'Episode title must publish while stream discovery is still pending');
    assert.ok(changes.some(value => value?.year === 2009 && value?.imdbRating === '8.5' && value?.logo === '/logo.svg'), 'All player metadata must publish while streams remain pending');
    finishStreams([{ url: 'https://example.test/top.mp4' }]);
    await pending;
    const lastPrepared = changes.filter(value => value?.media).at(-1);
    assert.equal(lastPrepared.media.episodeTitle, expectedTitle, 'Source completion must preserve the early title');
    assert.equal(lastPrepared.media.streamUrl, 'https://example.test/top.mp4');
    console.log(onPage ? 'PASS: actual player starts from page title/artwork/metadata and joins its stream request with zero duplicate reads.' : 'PASS: actual player requests missing metadata and streams concurrently, publishes the episode title first, and preserves it when playback becomes ready.');
})().catch(error => { console.error(error); process.exitCode = 1; });
