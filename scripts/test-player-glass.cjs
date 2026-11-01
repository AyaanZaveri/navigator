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
assert.ok(value('[data-player-glass]', '--player-glass-color').includes('transparent'), 'The surface must reveal its backdrop');
assert.ok(value('[data-player-glass]', '--player-glass-sheen').includes('var(--foreground)'), 'A theme-token sheen keeps native video controls readable even without WebView backdrop pixels');
const tint = Number(value('[data-player-glass]', '--player-glass-color').match(/--player-glass-tint,\s*(\d+)%/)[1]) / 100;
const sheen = Number(value('[data-player-glass]', '--player-glass-sheen').match(/--foreground\)\s*(\d+)%/)[1]) / 100;
const darkTokens = fs.readFileSync('app/globals.css', 'utf8').match(/\.dark\s*\{([^}]+)/)[1];
const gray = lightness => { const linear = lightness ** 3; return linear <= .0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - .055; };
const background = gray(Number(darkTokens.match(/--background:\s*oklch\(([\d.]+)/)[1]));
const foreground = gray(Number(darkTokens.match(/--foreground:\s*oklch\(([\d.]+)/)[1]));
const luminance = channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
const brightestGlass = (background * tint + 1 - tint) * (1 - sheen) + foreground * sheen;
assert.ok((luminance(foreground) + .05) / (luminance(brightestGlass) + .05) >= 4.5, 'Back text remains readable over a white backdrop, including the glass sheen');
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
for (const button of backButtons) {
  assert.ok(attr(button, 'data-player-glass'), 'Every Back state uses the shared glass');
  assert.equal(attr(button, 'size').initializer.text, 'icon', 'Back is an icon-sized control in both player states');
  assert.match(attr(button, 'className').initializer.text, /rounded-full/, 'Back remains circular');
  const children = button.parent.children.filter(child => ts.isJsxText(child)).map(child => child.text.trim()).join('');
  assert.equal(children, '', 'Back must not render a visible text label');
}
console.log('PASS: shared transparent 12px glass, prefixed blur, token sheen, dark portal theme and blur on the fading element itself');

const mobileBack = rules.find(rule => rule.selector === '[data-player-close]' && rule.parent.type === 'atrule' && rule.parent.name === 'media');
const dimension = prop => mobileBack.nodes.find(node => node.prop === prop)?.value;
assert.equal(dimension('width'), dimension('height'), 'Mobile minimum touch target must remain square so rounded-full is actually circular');

assert.equal(value('[data-player-close]', 'border'), '0', 'Back keeps glass without its border');

const nativeCss = postcss.parse(fs.readFileSync('android/app/src/main/assets/edge-to-edge.css','utf8'));
const nativeBack = nativeCss.nodes.find(node => node.type==='rule' && node.selector.includes(':is(button[data-player-close]'));
const nativeValue = prop => nativeBack.nodes.find(node=>node.prop===prop)?.value;
assert.equal(nativeValue('width'),'40px'); assert.equal(nativeValue('height'),'40px');
assert.equal(nativeValue('padding'),'0'); assert.equal(nativeValue('border'),'0');
