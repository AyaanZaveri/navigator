const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { load, hooks } = require('./test-support/react-hooks.cjs');

const dependencies = {
  react: React,
  'react/jsx-runtime': require('react/jsx-runtime'),
  'next/link': ({ prefetch, scroll, ...props }) => {
    assert.equal(scroll, false, 'Card navigation must let the shell reset to the hero instead of Next scrolling the poster into view');
    return React.createElement('a', props);
  },
  '@/lib/preload-tools': { preloadPlayer() {} },
  '@/components/home-palette-provider': { useHomePaletteScene: () => null },
  '@/lib/media/playback-details': require('./test-support/playback-context.cjs').details,
  '@/lib/artwork': { mediaArtwork: () => ({ poster: '/poster.jpg', background: '/still.jpg' }), backdropVariantUrl: url => url },
  '@/lib/series-route': { buildEpisodePath: () => '/series/test/1/1' },
  '@/contexts/MediaPlayerContext': { usePlaybackActions: () => ({}) },
  '@/components/watched-indicator': { WatchedIndicator: () => null },
  './media-card.module.css': new Proxy({}, { get: (_, key) => key === '__esModule' ? false : key }),
};
const imageDependencies = {
  react: React,
  'react/jsx-runtime': require('react/jsx-runtime'),
  '@/lib/utils': { cn: (...values) => values.filter(Boolean).join(' ') },
  './artwork-image.module.css': { pending: 'pending', fallback: 'fallback' },
};
const artwork = load('components/artwork-image.tsx', imageDependencies);
dependencies['@/components/artwork-image'] = artwork;
const { MediaCard } = load('components/media-card.tsx', dependencies);
for (const continueWatching of [false, true]) {
  const html = renderToStaticMarkup(React.createElement(MediaCard, {
    item: { id: 'tt123', name: 'Fixture', type: 'movie' }, continueWatching,
  }));
  assert.match(html, /data-artwork-state="loading"/, `${continueWatching ? 'Continue watching' : 'Poster'} artwork must have a visible loading surface before download/hydration`);
}
console.log('PASS: card artwork reserves an opaque loading surface before image requests complete.');

const h = hooks();
const { ArtworkImage } = load('components/artwork-image.tsx', {
  ...imageDependencies, react: { ...React, ...h.react }, 'react/jsx-runtime': h.jsx,
});
let loaded = 0;
const props = { src: '/first.jpg', alt: 'Poster', width: 144, height: 216, onLoad() { loaded++; } };
let image = h.render(ArtworkImage, props);
assert.equal(image.type, 'img', 'Preserve the existing image node and geometry');
assert.equal(image.props['data-artwork-state'], 'loading');
assert.match(image.props.className, /pending/);
assert.equal(image.props.width, 144);
const staleLoad = image.props.onLoad;
image.props.onLoad({ currentTarget: {} });
assert.equal(loaded, 1);
image = h.render(ArtworkImage, props);
assert.equal(image.props['data-artwork-state'], 'ready', 'Reveal immediately on load, with no timeout or decode wait');
assert.doesNotMatch(image.props.className, /pending/);
const next = { ...props, src: '/second.jpg' };
image = h.render(ArtworkImage, next);
assert.equal(image.props['data-artwork-state'], 'loading', 'A reused card must show a skeleton for its new URL');
staleLoad({ currentTarget: {} });
image = h.render(ArtworkImage, next);
assert.equal(image.props['data-artwork-state'], 'loading', 'A stale request cannot reveal a newer source');
image.props.onError({ currentTarget: {} });
image = h.render(ArtworkImage, next);
assert.equal(image.props['data-artwork-state'], 'error');
assert.equal(image.props.role, 'img');
assert.match(image.props['aria-label'], /unavailable/);
const cached = { ...props, src: '/cached.jpg' };
image = h.render(ArtworkImage, cached);
image.props.ref({ complete: true, naturalWidth: 500 });
h.flush();
image = h.render(ArtworkImage, cached);
assert.equal(image.props['data-artwork-state'], 'ready', 'Recover a cache load that completed before hydration');
const cachedFailure = { ...props, src: '/cached-failure.jpg' };
image = h.render(ArtworkImage, cachedFailure);
image.props.ref({ complete: true, naturalWidth: 0 });
image = h.render(ArtworkImage, cachedFailure);
assert.equal(image.props['data-artwork-state'], 'error', 'A failure before hydration must not leave an endless loading surface');
image = h.render(ArtworkImage, { ...cached, srcSet: '/larger.jpg 780w', sizes: '320px' });
assert.equal(image.props['data-artwork-state'], 'loading', 'Responsive source changes reset the loading treatment too');
image = h.render(ArtworkImage, { ...props, src: '' });
assert.equal(image.props['data-artwork-state'], 'error');
h.unmount();

const css = require('postcss').parse(require('node:fs').readFileSync('components/artwork-image.module.css', 'utf8'));
const pending = css.nodes.find(node => node.selector === '.pending');
assert.ok(pending.nodes.some(node => node.prop === 'background-color' && node.value === 'var(--accent)'), 'Pending images must paint an opaque themed skeleton');
assert.ok(!pending.nodes.some(node => ['opacity', 'visibility', 'display', 'animation'].includes(node.prop)), 'Do not hide progressive pixels or animate every offscreen card');
console.log('PASS: source changes, stale events, immediate load, pre-hydration cache hits, failures and missing images.');
