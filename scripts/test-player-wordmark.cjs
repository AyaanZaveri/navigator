const assert = require('node:assert/strict');
const { load } = require('./test-support/react-hooks.cjs');
const { PlayerLoadingWordmark } = load('components/player-loading-wordmark.tsx', {
  react: { useState: initial => [initial, () => {}] },
  './player-loading-wordmark.module.css': {},
  '@/lib/artwork': load('lib/artwork.ts', {}, { URLSearchParams }),
});
const src = '/api/artwork?id=tt1442437&type=series&kind=logo&v=3';
const tree = PlayerLoadingWordmark({ src, alt: 'Modern Family logo', loading: true });
const children = tree.props.children.props.children;
const image = children[0];
assert.equal(image.props.src, src, 'Visible wordmark must reuse the same artwork URL as cards, rather than wait on the separate mask proxy');
assert.equal(image.props.fetchPriority, 'high');
assert.ok(children[1].props.style.maskImage.includes('sample=1'), 'The shimmer still uses origin-safe mask bytes');
assert.ok(!PlayerLoadingWordmark({ src, alt: 'Logo', loading: false }).props.children.props.children[1]);
console.log('PASS: player wordmark reuses cached card artwork at high priority; only the shimmer requests a same-origin sample.');
