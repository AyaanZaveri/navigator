const assert = require('node:assert/strict');
const fs = require('node:fs');
const postcss = require('postcss');
const css = postcss.parse(fs.readFileSync('components/player-mobile.css', 'utf8'));
const rules = [];
css.walkRules(rule => rules.push(rule));
const rule = selector => rules.find(rule => rule.selector === selector);
const value = (selector, property) => rule(selector)?.nodes.find(node => node.prop === property)?.value;
const copy = '[data-player-shell] [data-slot="media-player"] [data-player-loading-copy]';
const back = '[data-player-shell] [data-player-close]';
assert.equal(value(copy, 'left'), 'var(--player-chrome-left)', 'Loading title, series, metadata and spinner use the same leading edge as Back');
assert.equal(value(back, 'left'), value(copy, 'left'));
assert.equal(rule(copy).parent.type, 'root', 'Alignment also applies on wide landscape touchscreens, not only a narrow mobile media query');
assert.equal(value(copy, 'right'), 'var(--player-chrome-right)', 'Trailing gutter remains safe independently of the leading camera clearance');
const android = 'html[data-native-engine="exoplayer"] [data-player-shell]';
const leading = value(android, '--player-chrome-left');
assert.ok(leading, 'Android uses the actual Back-button camera clearance');
function evaluate(expression, variables) {
  const math = expression.replace(/var\((--[\w-]+)(?:,\s*([^()]+))?\)/g, (_, key, fallback) => String(variables[key] ?? fallback))
    .replace(/([\d.]+)rem/g, (_, n) => String(Number(n) * 16)).replace(/px/g, '').replace(/calc/g, '');
  assert.match(math, /^[\d\s.+\-*/()]+$/);
  return Function(`return (${math})`)();
}
for (const [backLeft, expected] of [[16, 20], [8, 12], [40, 44]]) {
  for (const safeLeft of [0, 32, 68]) for (const controlsLeft of [24, 92]) {
    const variables = { '--navigator-player-back-left': backLeft,
      '--navigator-safe-left': safeLeft, '--navigator-player-controls-left': controlsLeft };
    assert.equal(evaluate(leading, variables), expected, 'Landscape safe areas and late playback-control measurements cannot shift loading copy away from Back');
  }
}
// Older APKs append this lower-specificity loading rule at document-start.
const oldAndroid = postcss.parse(fs.readFileSync('android/app/src/main/assets/edge-to-edge.css', 'utf8'));
let oldCopy;
oldAndroid.walkRules(rule => { if (rule.selector === '[data-slot="media-player"] [data-player-loading-copy]') oldCopy = rule; });
assert.ok(oldCopy);
assert.ok((copy.match(/\[/g) || []).length > (oldCopy.selector.match(/\[/g) || []).length,
  'The web fix must win over the already installed APK CSS without requiring a rebuild');
console.log('PASS: shared Back/loading gutter across desktop, Android landscape cutouts, changing control insets and installed APK compatibility');

// Both sides of the integration conflict must survive: web uses the loaded
// player's 24px gutter while native retains Back/camera alignment above.
const webShell = 'html:not([data-native-platform]) [data-player-shell]';
const webCopy = `${webShell} [data-slot="media-player"] [data-player-loading-copy]`;
const webControls = `${webShell} [data-slot="media-player-controls"]`;
assert.equal(value(webShell, '--player-content-left'), 'max(1.5rem, env(safe-area-inset-left, 0px))');
assert.equal(value(webShell, '--player-content-right'), 'max(1.5rem, env(safe-area-inset-right, 0px))');
assert.equal(value(webCopy, 'left'), value(webControls, 'padding-left'));
assert.equal(value(webCopy, 'right'), value(webControls, 'padding-right'));
assert.ok(rules.indexOf(rule(webCopy)) > rules.indexOf(rule(copy)), 'Web-specific gutters override the shared native fallback');
console.log('PASS: web loading/playback gutters match without replacing native camera-safe alignment');
