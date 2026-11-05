const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function widget(name) { const Component = () => null; Component.widgetName = name; return Component; }
function load(file, dependencies) {
  const context = { exports: {}, require: name => dependencies[name] || require(name) };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, context, { filename: file });
  return context.exports;
}
const ResultCard = widget('ResultCard');
const ResultMeta = widget('ResultMeta');
const { SeasonCard } = load('components/navigator/season-card.tsx', {
  'lucide-react': { Layers: widget('Layers') },
  '@/lib/navigator-title-path': { navigatorTitlePath: () => '/series/show/4/1' },
  './result-card': { ResultCard, ResultMeta },
});
const season = SeasonCard({ season: { id: 'show:4', name: 'Season 4', seasonNumber: 4, episodeCount: 7 } });
assert.equal(season.type, ResultCard);
assert.equal(season.props.title, 'Season 4');
const seasonMeta = season.props.metadata.props.children.filter(Boolean);
assert.equal(seasonMeta.length, 1, 'Do not repeat the season name in metadata');
assert.equal(seasonMeta[0].props.children.join(''), '7 episodes');
const oneEpisode = SeasonCard({ season: { id: 'show:1', name: 'Season 1', episodeCount: 1 } });
assert.equal(oneEpisode.props.metadata.props.children.filter(Boolean)[0].props.children.join(''), '1 episode');

const { EpisodeMetadataCard } = load('components/navigator/episode-metadata-card.tsx', {
  'lucide-react': { Star: widget('Star'), Tv: widget('Tv') },
  '@/lib/artwork': { artworkUrl: () => undefined },
  '@/lib/navigator-title-path': { navigatorTitlePath: () => '/series/show' },
  './result-card': { ResultCard, ResultMeta },
});
const scoped = EpisodeMetadataCard({ catalog: { seriesName: 'Nathan for You', seasonNumber: 4, seasonCount: 1, episodeCount: 7 } });
const scopedMeta = scoped.props.metadata.props.children.filter(Boolean);
assert.equal(scopedMeta[0].props.children, 'Series');
assert.equal(scopedMeta[1].props.children.join(''), 'Season 4', 'Scoped catalogs identify the season rather than presenting the one-season subset as the full show');
assert.equal(scopedMeta[2].props.children.join(''), '7 episodes');
const full = EpisodeMetadataCard({ catalog: { seriesName: 'Nathan for You', seasonCount: 4, episodeCount: 32 } });
const fullMeta = full.props.metadata.props.children.filter(Boolean);
assert.equal(fullMeta[1].props.children.join(''), '4 seasons', 'Unfiltered catalogs preserve whole-show totals');
assert.equal(fullMeta[2].props.children.join(''), '32 episodes');

const css = fs.readFileSync('components/navigator/result-card.module.css', 'utf8');
assert.match(css, /\.titleText\s*\{[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/s, 'Default interactive titles retain compact ellipsis behavior');
assert.match(css, /\.row:has\(\.metadata \.meta\) \.titleText\s*\{[^}]*white-space:\s*normal;[^}]*-webkit-line-clamp:\s*2;/s, 'Metadata-backed web source titles wrap up to two lines instead of relying on hover');
assert.match(css, /overflow-wrap:\s*anywhere;/, 'Long unbroken source titles can wrap within a narrow card');

console.log('PASS: season and catalog card props preserve scope and plurality; narrow metadata-backed titles wrap to two lines.');
