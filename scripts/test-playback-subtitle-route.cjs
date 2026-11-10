const assert = require('node:assert/strict');
const { load } = require('./test-support/react-hooks.cjs');
let authenticated = true, calls = [];
const { GET, POST } = load('app/api/playback/subtitles/route.ts', {
    '@/lib/server/auth': { getAuthData: async () => { if (!authenticated) throw Error('signed out'); } },
    '@/app/actions/utils': { getSubtitleTracks: async (...args) => { calls.push(args); return [{ src: 'https://fixture.test/en.srt' }]; } },
    '@/app/actions/subtitles': { fetchSubtitleFileContent: async (...args) => { calls.push(args); return { success: true, content: 'captions' }; } },
}, { URL, Response, AbortSignal });
const get = params => GET(new Request('https://navigator.test/api/playback/subtitles?' + new URLSearchParams(params)));
const post = src => POST(new Request('https://navigator.test/api/playback/subtitles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ src }) }));
async function main() {
    authenticated = false;
    assert.equal((await get({ id: 'tt123', type: 'movie' })).status, 401);
    assert.equal((await post('https://fixture.test/en.srt')).status, 401);
    assert.equal(calls.length, 0);
    authenticated = true;
    for (const params of [{ id: '../private', type: 'movie' }, { id: 'tt123', type: 'unknown' }, { id: 'tt123', type: 'movie', videoSize: '-1' }, { id: 'tt123', type: 'movie', filename: 'a'.repeat(2049) }]) {
        assert.equal((await get(params)).status, 400);
    }
    let response = await get({ id: 'tt123:1:2', type: 'series', filename: 'release.mkv', videoSize: '1000', episodeTitle: 'A title' });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal((await response.json()).tracks.length, 1);
    assert.equal(calls[0][2].filename, 'release.mkv');
    assert.equal(calls[0][2].videoSize, 1000);
    assert.ok(calls[0][2].signal);
    for (const src of ['file:///etc/passwd', 'javascript:alert(1)', '', null]) assert.equal((await post(src)).status, 400);
    response = await post('https://fixture.test/en.srt');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal((await response.json()).content, 'captions');
    assert.ok(calls[1][1]);
    const abort = new AbortController(); abort.abort();
    response = await GET(new Request('https://navigator.test/api/playback/subtitles?id=tt123&type=movie', { signal: abort.signal }));
    assert.equal(response.status, 502, 'Canceled reads cannot publish successful results');
    assert.ok(calls.at(-1)[2].signal.aborted);
    console.log('PASS: subtitle read endpoints authenticate, validate inputs, preserve release hints, forward cancellation, and disable shared caching');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
