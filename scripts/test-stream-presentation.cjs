const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/media/stream-presentation.ts', 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, context);
const parse = stream => JSON.parse(JSON.stringify(context.exports.getStreamPresentation(stream)));

const decorated = parse({ name: ' 1080P    ⚡️\n 〈Web\u200d-\u200ddl〉\u200d \u200d\n ★★☆ ' });
assert.deepEqual(decorated, {
    resolution: '1080p', source: 'WebDL', lightning: true, stars: [true, true, false], details: [],
});
assert.deepEqual(parse({ name: '★ ☆ ⭐ 4K WEB_RIP ⚡ Provider' }), {
    resolution: '2160p', source: 'WebRip', lightning: true, stars: [true, false, true], details: ['Provider'],
});
const filename = 'Episode.S01E03_1080p_WEB-DL.mkv';
const fromFile = parse({ name: 'Some add-on', behaviorHints: { filename } });
assert.equal(fromFile.resolution, '1080p');
assert.equal(fromFile.source, 'WebDL');
assert.equal(fromFile.lightning, false);
assert.deepEqual(fromFile.stars, []);
assert.deepEqual(fromFile.details, ['Some add-on']);
assert.deepEqual(parse({ title: filename }).details, [filename], 'Filename text must not be rewritten');
assert.deepEqual(parse({ name: 'Custom source', title: '[English]\nUnknown provider information' }).details,
    ['Custom source', '[English]', 'Unknown provider information']);
assert.deepEqual(parse({}).details, []);
assert.equal(parse({ name: 'Cambridge documentaries' }).source, undefined, 'Do not classify partial words as quality');
console.log('PASS: source badges, resolution aliases, Unicode spacing, filled/empty ratings, filename fallback and unknown-text preservation.');
