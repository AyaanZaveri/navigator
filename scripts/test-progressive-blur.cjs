const assert = require('node:assert/strict');
const fs = require('node:fs');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { load, hooks } = require('./test-support/react-hooks.cjs');
const postcss = require('postcss');
const { ProgressiveBlur } = load('components/motion-primitives/progressive-blur.tsx', {
  '@/lib/utils': { cn: (...values) => values.filter(Boolean).join(' ') },
  // Static blur must not initialize Motion or a client-side animation runtime.
  'motion/react': new Proxy({}, { get() { throw Error('Unexpected Motion dependency'); } }),
});

for (const [count, intensity, expectedRadii] of [[6, 2.4, [2.4, 4.8, 7.2, 9.6, 12]], [4, 4, [4, 8, 12]]]) {
  for (const [direction, angle] of [['top', 0], ['right', 90], ['bottom', 180], ['left', 270]]) {
    const tree = ProgressiveBlur({ blurLayers: count, blurIntensity: intensity, direction, id: 'blur-surface' });
    const layers = React.Children.toArray(tree.props.children);
    assert.equal(layers.length, count - 1, 'Identity filters must not occupy a layer');
    layers.forEach((layer, index) => assert.ok(Math.abs(parseFloat(layer.props.style.backdropFilter.slice(5)) - expectedRadii[index]) < 1e-12));
    assert.equal(tree.props.id, 'blur-surface', 'DOM props belong on the container once');
    assert.equal(tree.props.style?.opacity, undefined, 'No wrapper opacity may isolate the backdrop');
    for (let offset = 0; offset < layers.length; offset++) {
      const layer = layers[offset];
      const style = layer.props.style;
      assert.equal(layer.type, 'div', 'Blur layers must render as plain HTML');
      assert.equal(layer.props.id, undefined);
      assert.equal(style.maskImage, style.WebkitMaskImage);
      assert.equal(style.backdropFilter, style.WebkitBackdropFilter);
      assert.ok(style.maskImage.startsWith(`linear-gradient(${angle}deg,`));
      // Sample the public blur-ramp contract in page coordinates. Removing the
      // identity layer must preserve every nonzero layer's mask at every point.
      const stops = Array.from(style.maskImage.matchAll(/\) ([\d.]+)%/g), match => Number(match[1]) / 100);
      const i = offset + 1;
      const alpha = point => {
        if (point <= stops[0] || point >= stops[3]) return 0;
        if (point < stops[1]) return (point - stops[0]) / (stops[1] - stops[0]);
        if (point <= stops[2]) return 1;
        return (stops[3] - point) / (stops[3] - stops[2]);
      };
      for (let pixel = 0; pixel <= 1000; pixel++) {
        const point = pixel / 1000;
        const expected = Math.max(0, Math.min(1, point * (count + 1) - i, i + 3 - point * (count + 1)));
        assert.ok(Math.abs(alpha(point) - expected) < 1e-12, 'The original blur falloff must remain unchanged');
      }
    }
    const html = renderToStaticMarkup(React.createElement(ProgressiveBlur, { blurLayers: count, blurIntensity: intensity, direction, id: 'blur-surface' }));
    assert.equal((html.match(/id="blur-surface"/g) ?? []).length, 1);
    assert.ok(!html.includes('blur(0px)'));
  }
}
for (const layers of [-10, 0, 1, 2.5, NaN, Infinity, 999999]) {
  const tree = ProgressiveBlur({ blurLayers: layers });
  const children = React.Children.toArray(tree.props.children);
  assert.ok(children.length >= 1 && children.length <= 11);
  assert.ok(children.every(child => !/NaN|Infinity/.test(child.props.style.maskImage)));
}
for (const intensity of [0, -1]) {
  assert.equal(React.Children.count(ProgressiveBlur({ blurIntensity: intensity }).props.children), 0, 'Disabled blur must not leave invisible filters');
}
console.log('PASS: unchanged blur ramps in all directions, static server rendering, bounded inputs, and no identity/Motion layers.');

const h = hooks(), frames = new Map(), events = new Map(), properties = new Map();
let nextFrame = 0, disconnected = false;
const layers = Array.from({ length: 6 }, () => ({ style: {} }));
const scroller = { scrollTop: 0, addEventListener(name, cb) { events.set(name, cb); }, removeEventListener(name) { events.delete(name); } };
const header = {
  closest: () => ({ style: { setProperty: (key, value) => properties.set(key, value) } }),
  getBoundingClientRect: () => ({ height: 108 }),
  parentElement: { querySelector: () => scroller },
};
const dependencies = new Proxy({
  react: { ...React, ...h.react, useLayoutEffect: h.react.useEffect },
  'react/jsx-runtime': h.jsx,
  '@/contexts/MediaPlayerContext': { useIsPlayerVisible: () => false },
}, { has: () => true, get: (object, key) => key in object ? object[key] : new Proxy({}, { get: () => () => null }) });
const { AppHeader } = load('components/app-header.tsx', dependencies, {
  ResizeObserver: class { observe() {} disconnect() { disconnected = true; } },
  requestAnimationFrame: cb => { frames.set(++nextFrame, cb); return nextFrame; },
  cancelAnimationFrame: id => frames.delete(id),
});
const tree = h.render(AppHeader, { email: 'test@example.test' });
tree.props.ref.current = header;
tree.props.children[0].props.ref.current = { querySelectorAll: () => layers };
h.flush();
assert.equal(properties.get('--app-header-height'), '108px');
assert.ok(layers.every(layer => layer.style.opacity === '0' && layer.style.visibility === 'hidden'));
events.get('scroll')();
assert.equal(frames.size, 0, 'A settled transparent header must not schedule frames');
scroller.scrollTop = 96;
for (let i = 0; i < 10; i++) events.get('scroll')();
assert.equal(frames.size, 1, 'Scroll events coalesce to one frame');
function flushFrame() { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(cb => cb(0)); }
flushFrame();
assert.ok(layers.every(layer => layer.style.opacity === '0.5' && layer.style.visibility === 'visible'));
scroller.scrollTop = 300; events.get('scroll')(); flushFrame();
assert.ok(layers.every(layer => layer.style.opacity === '1'));
for (let y = 400; y < 10000; y += 100) { scroller.scrollTop = y; events.get('scroll')(); }
assert.equal(frames.size, 0, 'Scrolling beyond a settled fade must schedule no more header frames');
scroller.scrollTop = 0; events.get('scroll')(); flushFrame();
assert.ok(layers.every(layer => layer.style.visibility === 'hidden'));
assert.equal(h.updates, 0, 'Header scrolling must not rerender React');
scroller.scrollTop = 10; events.get('scroll')();
h.unmount();
assert.equal(events.size, 0);
assert.equal(frames.size, 0);
assert.equal(disconnected, true);

const css = postcss.parse(fs.readFileSync('components/app-header.module.css', 'utf8'));
const leaf = css.nodes.find(node => node.type === 'rule' && node.selector.includes('.blur > div'));
assert.ok(leaf.nodes.some(node => node.prop === 'visibility' && node.value === 'hidden'));
assert.ok(leaf.nodes.some(node => node.prop === 'transition' && node.value.includes('visibility 180ms')),
  'Visibility must wait for opacity to finish fading out, rather than hiding abruptly');
console.log('PASS: hidden header filters, continuous fade, no settled scroll frames, no React scroll updates, and lifecycle cleanup.');
