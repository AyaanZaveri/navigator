const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/addons.ts', 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, context);
const { toAddonListItem, filterAddons, addonTypeLabel } = context.exports;
for (const [type, label] of Object.entries({
  movie: 'Movies', series: 'TV Shows', 'anime.movie': 'Anime Movies',
  'anime.series': 'Anime TV Shows', anime: 'Anime', Trakt: 'Trakt',
  collection: 'Collection', library: 'Library', other: 'Other', tv: 'TV',
  events: 'Events', subtitles: 'Subtitles', 'custom_category.name': 'Custom Category Name',
})) assert.equal(addonTypeLabel(type), label);
const addon = toAddonListItem({
  transportUrl: 'https://example.com/private-configuration-token/manifest.json',
  manifest: {
    id: 'sample', name: ' Example ', description: 'Independent cinema', version: '1.0',
    resources: ['streams', { name: 'stream', types: ['movie'] }, 'meta'],
    types: ['movie', 'movie'], catalogs: [{ id: 'popular' }],
  },
}, 0);
assert.equal(addon.name, 'Example');
assert.equal(addon.capabilities.join(','), 'stream,meta,catalog');
assert.equal(addon.types.join(','), 'movie');
assert.equal(addon.catalogCount, 1);
assert.ok(!JSON.stringify(addon).includes('private-configuration-token'));
assert.equal(filterAddons([addon], '  CINEMA  ', 'stream').length, 1);
assert.equal(filterAddons([addon], 'Metadata').length, 1);
assert.equal(filterAddons([addon], '', 'subtitles').length, 0);
assert.equal(filterAddons([addon], 'missing', 'stream').length, 0);
const empty = toAddonListItem({ manifest: { id: 'empty', name: ' ' } }, 1);
assert.equal(empty.name, 'Unnamed addon');
assert.equal(empty.capabilities.length, 0);
assert.equal(empty.types.length, 0);
console.log('PASS: addon capabilities, search/filter combinations, missing metadata, and private configuration handling');
