const assert = require('node:assert/strict');
const fs = require('node:fs');
const postcss = require('postcss');
const ts = require('typescript');
const css = postcss.parse(fs.readFileSync('components/player-mobile.css', 'utf8'));
const rules = [];
css.walkRules(rule => rules.push(rule));
const value = (selector, property) => rules.find(rule => rule.selector === selector)?.nodes.find(node => node.prop === property)?.value;
assert.equal(value('[data-player-glass]', 'backdrop-filter'), 'blur(12px)', 'Player glass uses the same actual blur as the media-card Play button');
assert.equal(value('[data-player-glass]', '-webkit-backdrop-filter'), 'blur(12px)');
assert.ok(value('[data-player-glass]', 'background-color').includes('transparent'), 'The surface must reveal its backdrop');
assert.ok(value('[data-player-glass]', 'background-image').includes('var(--foreground)'), 'A theme-token sheen keeps native video controls readable even without WebView backdrop pixels');
assert.equal(value('[data-player-close]', 'backdrop-filter'), undefined, 'Back uses the shared glass surface instead of a conflicting blur');
function openings(path) {
  const source = ts.createSourceFile(path, fs.readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const nodes = [];
  function walk(node) { if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) nodes.push(node); ts.forEachChild(node, walk); }
  walk(source);
  return { source, nodes };
}
const attr = (node, name) => node.attributes.properties.find(prop => ts.isJsxAttribute(prop) && prop.name.getText() === name);
const seek = openings('components/ui/media-player.tsx');
const panel = seek.nodes.find(node => attr(node, 'data-slot')?.initializer?.getText() === '"media-player-seek-tooltip"');
assert.ok(attr(panel, 'data-player-glass'), 'The opacity-fading tooltip itself owns the blur; no opacity parent may trap it');
assert.match(attr(panel, 'className').initializer.getText(), /dark/, 'Portalled glass retains the dark player tokens in either browsing theme');
assert.match(attr(panel, 'style').initializer.getText(), /opacity:/, 'Keep the existing tooltip fade on its own blur surface');
assert.ok(!attr(panel, 'style').initializer.getText().includes('visibility:'), 'Reveal with opacity, preserving the same glass layer through the fade');
assert.ok(!fs.readFileSync('components/ui/media-player.tsx', 'utf8').includes('bg-background/98'), 'An opaque nested panel cannot conceal the blur');
const player = openings('components/global-media-player.tsx');
const backButtons = player.nodes.filter(node => attr(node, 'data-player-close'));
assert.equal(backButtons.length, 2, 'Cover loading and playback Back');
for (const button of backButtons) assert.ok(attr(button, 'data-player-glass'), 'Every Back state uses the shared glass');
console.log('PASS: shared transparent 12px glass, prefixed blur, token sheen, dark portal theme and blur on the fading element itself');
