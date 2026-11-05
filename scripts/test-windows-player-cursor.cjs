const assert = require('node:assert/strict');
const fs = require('node:fs');

const css = fs.readFileSync('components/desktop/native-playback.css', 'utf8');
const hiddenRule = css.match(/html\[data-native-platform="windows"\]\[data-native-playing\][^{]+\{[^}]+\}/);
assert.ok(hiddenRule, 'Windows cursor behavior is scoped to active native playback');
assert.match(hiddenRule[0], /\[data-slot="media-player"\]:not\(\[data-controls-visible\]\)/);
assert.match(hiddenRule[0], /cursor:\s*none/);
assert.match(css, /\[data-radix-popper-content-wrapper\].*cursor:\s*auto/,
  'interactive menus/dialogs must restore a visible cursor');
assert.doesNotMatch(css, /html\s*\{[^}]*cursor:\s*none/s, 'must not hide the OS/global page cursor');
console.log('Windows player cursor regression checks passed');
