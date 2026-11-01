const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const context = { exports: {}, URL };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/media/playback-source.ts', 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, context);
const { getWebPlaybackElement } = context.exports;
for (const src of [
    'https://stream.example/api/debrid/playback/token/Episode.S01E03.mkv',
    'https://stream.example/movie.webm',
    'https://stream.example/playback/token',
    'blob:https://example.test/opaque-id',
    null,
]) assert.equal(getWebPlaybackElement(src), 'video', 'Direct files must bypass Mux’s empty-type error');
for (const src of [
    'https://stream.example/movie.mp4?token=fixture',
    'https://stream.example/live.M3U8?token=fixture',
    'https://stream.mux.com/playback-id',
]) assert.equal(getWebPlaybackElement(src), 'mux', 'MP4/HLS should retain Mux playback');
assert.equal(getWebPlaybackElement('https://stream.mux.com.example.test/id'), 'video');
console.log('PASS: MKV, WebM and opaque direct streams bypass Mux; MP4, HLS and Mux playback IDs retain their player.');
