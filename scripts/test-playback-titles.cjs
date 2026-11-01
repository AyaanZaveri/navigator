const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/media/playback-titles.ts', 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, context);
const { getPlaybackTitles } = context.exports;
const request = { id: 'show', name: 'Show name', showName: 'Show name', episodeTitle: 'Show name', type: 'series', mediaSourceId: 'show:1:3' };
const details = { id: 'show', type: 'series', name: 'Show name', videos: [
    { id: 'show:1:2', title: 'Other episode', season: 1, episode: 2 },
    { id: 'show:1:3', title: 'The actual episode title', season: 1, episode: 3 },
] };
assert.equal(getPlaybackTitles(request, details).primaryTitle, 'The actual episode title');
assert.equal(getPlaybackTitles(request, details).showTitle, 'Show name');
assert.equal(getPlaybackTitles(request, null).primaryTitle, 'Episode 3', 'Never present the show name as a missing episode title');
assert.equal(getPlaybackTitles({ ...request, mediaSourceId: 'opaque', seasonNumber: 1, episodeNumber: 3 }, details).primaryTitle, 'The actual episode title');
assert.equal(getPlaybackTitles({ ...request, episodeTitle: 'Known episode' }, null).primaryTitle, 'Known episode');
assert.equal(getPlaybackTitles(request, { ...details, videos: [{ id: 'show:1:3', name: 'Episode name field' }] }).primaryTitle, 'Episode name field');
assert.equal(getPlaybackTitles({ id: 'movie', type: 'movie', name: 'Movie' }, null).primaryTitle, 'Movie');
console.log('PASS: episode metadata overrides show-name fallbacks; IDs and season/episode numbers match; explicit episode names and movies remain correct.');
