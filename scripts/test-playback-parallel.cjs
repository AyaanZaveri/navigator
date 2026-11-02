const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
function transpile(file) {
    return ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        fileName: file,
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText;
}
function utility(file) {
    const context = { exports: {} };
    vm.runInNewContext(transpile(file), context);
    return context.exports;
}
const callbacks = [], changes = [], requests = [];
let finishDetails, finishStreams;
const details = new Promise(resolve => { finishDetails = resolve; });
const streams = new Promise(resolve => { finishStreams = resolve; });
const request = { id: 'show', type: 'series', name: 'Show', showName: 'Show', mediaSourceId: 'show:1:3', seasonNumber: 1, episodeNumber: 3 };
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
    if (name === '@/lib/media/resolve-playback') return utility('lib/media/resolve-playback.ts');
    if (name === '@/lib/media/playback-titles') return utility('lib/media/playback-titles.ts');
    if (name === '@/lib/media/fetch-playback-streams') return { fetchPlaybackStreams() { requests.push('streams'); return streams; } };
    if (name === '@/app/actions') return { fetchMediaDetails() { requests.push('details'); return details; } };
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
    assert.deepEqual(requests, ['details', 'streams'], 'Both requests start before either resolves');
    finishDetails({ id: 'show', type: 'series', name: 'Show', videos: [{ id: 'show:1:3', title: 'Early episode title', season: 1, episode: 3 }] });
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(changes.some(value => value?.media?.episodeTitle === 'Early episode title'), 'Episode title must publish while stream discovery is still pending');
    finishStreams([{ url: 'https://example.test/top.mp4' }]);
    await pending;
    const lastPrepared = changes.filter(value => value?.media).at(-1);
    assert.equal(lastPrepared.media.episodeTitle, 'Early episode title', 'Source completion must preserve the early title');
    assert.equal(lastPrepared.media.streamUrl, 'https://example.test/top.mp4');
    console.log('PASS: actual player requests metadata and streams concurrently, publishes the episode title first, and preserves it when playback becomes ready.');
})().catch(error => { console.error(error); process.exitCode = 1; });
