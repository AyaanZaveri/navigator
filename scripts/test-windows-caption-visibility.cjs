const assert = require('node:assert/strict');
const { load } = require('./test-support/react-hooks.cjs');
for (const nativeVisibility of [false, true]) {
  let playing = false, loading = false, controls = false, changed, disconnected = false;
  const root = { dataset: {} }, sent = [], shown = [], listeners = {};
  const caption = { getBoundingClientRect: () => ({ left: 900, right: 996, top: 0, bottom: 24 }) };
  const media = { hasAttribute: () => controls };
  const player = { querySelector: selector => selector.includes('loading-copy') ? loading ? {} : null : media };
  const { watchWindowsCaptionVisibility } = load('lib/desktop/windows-caption-visibility.ts', {}, {
    document: { documentElement: root, querySelector: selector => selector.includes('Window controls') ? caption : playing ? player : null,
      addEventListener: (type, fn) => { listeners[type] = fn; }, removeEventListener: type => { delete listeners[type]; } },
    window: { addEventListener: (type, fn) => { listeners[type] = fn; }, removeEventListener: type => { delete listeners[type]; } },
    MutationObserver: class { constructor(fn) { changed = fn; } observe() {} disconnect() { disconnected = true; } },
  });
  const stop = watchWindowsCaptionVisibility({ platform: 'windows', capabilities: { windowControlsVisibility: nativeVisibility }, send: m => sent.push(m) }, visible => shown.push(visible));
  assert.equal(shown.at(-1), true, 'Browsing keeps caption controls');
  playing = true; changed(); assert.equal(shown.at(-1), false, 'Idle video hides captions with media controls');
  loading = true; changed(); assert.equal(shown.at(-1), true, 'Loading keeps captions available');
  loading = false; controls = true; changed(); assert.equal(shown.at(-1), true, 'Pointer/focus media chrome reveals captions');
  listeners.pointerout({ clientX: 948, clientY: 12 });
  controls = false; changed(); assert.equal(shown.at(-1), true, 'Moving from player into caption holds visibility before player mouseleave');
  for (let i = 0; i < 20; i++) { changed(); assert.equal(shown.at(-1), true, 'Idle timer cannot hide the hovered caption'); }
  listeners.pointermove({ clientX: 600, clientY: 300 });
  assert.equal(shown.at(-1), false, 'Leaving caption releases visibility');
  root.dataset.windowControlHover = 'close'; changed();
  assert.equal(shown.at(-1), true, 'Native caption hover holds visibility on both native versions');
  delete root.dataset.windowControlHover; playing = false; changed();
  assert.equal(shown.at(-1), true, 'Back to browsing restores captions');
  const count = sent.length; changed(); assert.equal(sent.length, count, 'No repeated native commands without visibility changes');
  stop(); assert.ok(disconnected); assert.deepEqual(Object.keys(listeners), [], 'Cleanup removes interaction listeners');
  if (nativeVisibility) assert.equal(sent.at(-1).visible, true, 'Cleanup restores native hit regions');
  else assert.equal(sent.length, 0, 'Older builds receive no unsupported native visibility commands');
}
console.log('PASS: browsing/loading/hover visibility, idle playback hide, legacy fallback and native hit-region cleanup');
