const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const context = { exports: {}, require, AbortController, AbortSignal, Headers, Response, ReadableStream, setTimeout, clearTimeout };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/media/stream-metadata.ts', 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, context);
const { probeStreamMetadata } = context.exports;
const fixture = fs.readFileSync('scripts/fixtures/ios-playback.mp4');
let requests = 0, bytes = 0;
async function rangedFetch(url, init) {
    requests++;
    const match = /^bytes=(\d+)-(\d+)$/.exec(new Headers(init.headers).get('Range'));
    assert.ok(match, 'Probes must request bounded ranges');
    const start = Number(match[1]), end = Math.min(Number(match[2]), fixture.length - 1);
    const body = fixture.subarray(start, end + 1);
    bytes += body.length;
    return new Response(body, { status: 206, headers: { 'Content-Range': `bytes ${start}-${end}/${fixture.length}`, 'Content-Length': String(body.length) } });
}
(async () => {
    const stream = { url: 'https://fixture.test/movie.mp4', infoHash: 'abc123', fileIdx: 0 };
    const metadata = await probeStreamMetadata(stream, { fetchFn: rangedFetch });
    assert.equal(metadata?.video?.codec, 'avc', 'Parse actual H264 container metadata');
    assert.equal(metadata.audio[0].codec, 'aac');
    assert.equal(metadata.audio[0].primary, true);
    assert.equal(metadata.audio[0].channels, 2);
    assert.ok(requests <= 8 && bytes <= 2 * 1024 * 1024);
    const before = requests;
    assert.equal(await probeStreamMetadata({ ...stream, url: 'https://fixture.test/new-signed-url.mp4' }, { fetchFn: rangedFetch }), metadata);
    assert.equal(requests, before, 'Same torrent file reuses codec metadata across URLs');
    await probeStreamMetadata({ ...stream, fileIdx: 1 }, { fetchFn: rangedFetch });
    assert.ok(requests > before, 'Different files in the same torrent must be inspected separately');
    let cancelled = false;
    const ignoredRange = await probeStreamMetadata({ url: 'https://fixture.test/no-range' }, { fetchFn: async () => new Response(new ReadableStream({ cancel() { cancelled = true; } }), { status: 200 }) });
    assert.equal(ignoredRange, undefined);
    assert.equal(cancelled, true, 'A server ignoring ranges must not download an entire movie');
    const start = Date.now();
    const timeout = await probeStreamMetadata({ url: 'https://fixture.test/stalled' }, { timeoutMs: 30, fetchFn: async () => new Promise(() => {}) });
    assert.equal(timeout, undefined);
    assert.ok(Date.now() - start < 500, 'A stalled source must not delay playback indefinitely');
    const aborted = new AbortController(); aborted.abort();
    assert.equal(await probeStreamMetadata(stream, { signal: aborted.signal, fetchFn: rangedFetch }), undefined);
    console.log('PASS: real AVC/AAC metadata, torrent-file caching, bounded ranges, ignored-range cancellation and timeout.');
})().catch(error => { console.error(error); process.exitCode = 1; });
