const assert = require('node:assert/strict');
const fs = require('node:fs');
const postcss = require('postcss');

const css = fs.readFileSync('components/desktop/native-playback.css', 'utf8');
const rules = postcss.parse(css).nodes.filter(node => node.type === 'rule');
const hiddenRule = rules.find(rule => rule.nodes.some(node => node.prop === 'cursor' && node.value === 'none'));
assert.ok(hiddenRule, 'Desktop playback must hide the idle cursor');
for (const selector of hiddenRule.selectors) {
  assert.match(selector, /^html:is\(\[data-native-platform="windows"\], \[data-native-platform="macos"\]\)\[data-native-playing\]/,
    'Hide only during native playback on Windows and macOS');
  assert.match(selector, /\[data-player-shell\] \[data-slot="media-player"\]:not\(\[data-controls-visible\]\)/,
    'Controls becoming visible must release cursor hiding');
}
assert.equal(hiddenRule.selectors.length, 2);
assert.ok(hiddenRule.selectors.some(selector => selector.endsWith(' *')),
  'Overlay descendants with explicit cursor styles must hide the pointer too');
const visibleRule = rules.find(rule => rule.nodes.some(node => node.prop === 'cursor' && node.value === 'auto'));
assert.ok(visibleRule && rules.indexOf(visibleRule) > rules.indexOf(hiddenRule));
assert.equal(visibleRule.selectors.length, 2);
for (const selector of visibleRule.selectors) {
  assert.ok(selector.startsWith(hiddenRule.selectors[0] + ' '));
  for (const surface of ['[role="dialog"]', '[data-radix-popper-content-wrapper]', '[data-slot*="menu"]', '[data-slot*="popover"]', '[data-slot*="dialog"]', '[data-ask-navigator]']) {
    assert.ok(selector.includes(surface), `${surface}: interactive surfaces retain a cursor`);
  }
}
assert.ok(visibleRule.selectors.some(selector => selector.endsWith(' *')),
  'Menu/dialog descendants must restore the pointer instead of inheriting cursor:none');
assert.doesNotMatch(css, /html\s*\{[^}]*cursor:\s*none/s, 'must not hide the OS/global page cursor');
console.log('Windows/macOS player cursor regression checks passed');
