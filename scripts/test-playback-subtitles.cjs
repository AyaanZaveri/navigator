const assert = require('node:assert/strict');
const { load } = require('./test-support/react-hooks.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const { PlaybackSubtitles, fetchPlaybackSubtitles, fetchPlaybackSubtitleFile } = load('lib/media/playback-subtitles.ts', {}, { URLSearchParams, fetch: async (url, options) => {
    http.push({ url, options });
    return Response.json(options.method === 'POST' ? { success: true, content: 'cached cues' } : { tracks: [] });
} });
const http = [];
const tracks = [
    { src: 'https://fixture.test/en', language: 'en', label: 'English', kind: 'subtitles' },
    { src: 'https://fixture.test/fr', language: 'fr', label: 'French', kind: 'subtitles' },
    { src: 'https://fixture.test/forced', language: 'en', label: 'English forced', kind: 'subtitles', forced: true },
];
async function main() {
    const abort = new AbortController(), discovery = [], files = [];
    const session = new PlaybackSubtitles(abort.signal,
        async (...args) => { discovery.push(args); return tracks; },
        (src, signal) => new Promise((resolve, reject) => {
            const pending = { src, signal, resolve, reject }; files.push(pending);
            signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        }));
    const first = session.discover('tt123:1:2', 'series');
    assert.equal(session.discover('tt123:1:2', 'series'), first, 'Reuse in-flight base discovery');
    const initial = await first;
    const preferences = { subtitlesEnabledByDefault: true, subtitleLanguage: 'en', subtitleMode: 'normal' };
    session.preload(initial, preferences);
    assert.equal(files.length, 1, 'Download only the preferred track');
    assert.equal(files[0].src, tracks[0].src);
    const chosen = session.file(tracks[0].src);
    session.preload(initial, preferences);
    assert.equal(files.length, 1, 'Selection and repeated preloading share the file request');
    files[0].resolve({ success: true, content: 'early subtitle' });
    assert.equal((await chosen).content, 'early subtitle');
    assert.equal((await session.file(tracks[0].src)).content, 'early subtitle');
    await session.discover('tt123:1:2', 'series', { filename: 'release.mkv', videoSize: 1000, episodeTitle: 'Episode title' });
    assert.equal(discovery.length, 2, 'Release/title matching refines the initial catalog');
    assert.equal(discovery[1][2].filename, 'release.mkv');
    assert.equal(discovery[1][3], abort.signal);
    session.preload(initial, { ...preferences, subtitlesEnabledByDefault: false });
    assert.equal(files.length, 1, 'Disabled defaults do not preload files');
    session.preload(initial, { ...preferences, subtitleMode: 'forced' });
    assert.equal(files[1].src, tracks[2].src, 'Forced-only mode remains forced-only');
    files[1].reject(Error('temporary failure')); await tick();
    const retry = session.file(tracks[2].src);
    assert.equal(files.length, 3, 'Failed preloads can be retried on selection');
    files[2].resolve({ success: false, content: '' }); await retry;
    const canceled = session.file(tracks[1].src);
    abort.abort(); await assert.rejects(canceled);
    session.preload(initial, preferences);
    assert.equal(files.length, 4, 'Canceled sessions cannot preload new files');
    const signal = new AbortController().signal;
    await fetchPlaybackSubtitles('tt123:1:2', 'series', { filename: 'a b.mkv', videoSize: 1000, episodeTitle: 'A title' }, signal);
    assert.equal(new URL(http[0].url, 'https://fixture.test').searchParams.get('filename'), 'a b.mkv');
    assert.equal(http[0].options.signal, signal);
    await fetchPlaybackSubtitleFile(tracks[0].src, signal);
    assert.equal(http[1].url, '/api/playback/subtitles');
    assert.equal(http[1].options.method, 'POST');
    assert.equal(JSON.parse(http[1].options.body).src, tracks[0].src);
    console.log('PASS: early subtitle discovery/refinement, in-flight file reuse, default/forced preferences, retry, cancellation, and independent HTTP requests');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
