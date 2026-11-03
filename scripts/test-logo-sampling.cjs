const assert = require('node:assert/strict');
const fs = require('node:fs');
const { load, hooks } = require('./test-support/react-hooks.cjs');
const contrast = load('lib/logo-contrast.ts');
const backdrop = load('lib/logo-backdrop.ts', { '@/lib/logo-contrast': contrast }, { URL });
const surfaces = load('lib/logo-surfaces.ts');
const h = hooks();
const raf = new Map(), listeners = new Map();
let frame = 0, now = 0;
const rect = (left, top, width, height) => ({ left, top, width, height });
const defaults = { display: 'block', visibility: 'visible', opacity: '1', overflowX: 'visible', overflowY: 'visible',
  backgroundColor: 'transparent', backgroundImage: 'none', objectFit: 'cover', objectPosition: '50% 50%', getPropertyValue: () => '' };
class Element {
  constructor(tagName, bounds, parentElement, order) { Object.assign(this, { tagName, bounds, parentElement, order, style: { ...defaults } }); }
  contains(element) { for (; element; element = element.parentElement) if (element === this) return true; return false; }
  getBoundingClientRect() { return this.bounds; }
  compareDocumentPosition(other) { return this.order < other.order ? 4 : 2; }
}
const scope = new Element('DIV', rect(0, 0, 500, 500), null, 0);
const scroller = new Element('MAIN', scope.bounds, scope, 1);
scroller.style.backgroundColor = 'rgb(255, 255, 255)'; scroller.style.overflowY = 'auto';
const hero = new Element('IMG', rect(0, 0, 500, 300), scroller, 2); hero.src = '/hero-white.jpg';
const poster = new Element('IMG', rect(20, 400, 200, 300), scroller, 3); poster.src = '/api/artwork?id=tt123&type=series&kind=poster';
const header = new Element('HEADER', rect(0, 0, 500, 100), scope, 4);
const logo = new Element('SPAN', rect(30, 30, 32, 32), header, 5);
logo.closest = () => header;
header.querySelectorAll = () => [];
scope.querySelectorAll = selector => selector === 'img[data-header-backdrop]' ? [hero] : [hero, poster];
const eventTarget = { addEventListener: (name, handler) => listeners.set(name, handler), removeEventListener: name => listeners.delete(name) };
Object.assign(scope, eventTarget);
const paletteColor = source => source.includes('header-neutral') ? [244, 251, 249, 255]
  : source.includes('high-contrast') ? [7, 84, 73, 255]
  : source.includes('header-dark') ? [54, 204, 176, 255] : [17, 135, 119, 255];
const requestedImages = [];
class FakeImage {
  complete = false; naturalWidth = 100; naturalHeight = 100;
  set src(value) {
    requestedImages.push(value);
    this.source = value;
    if (value.includes('header-neutral')) return; // One slow variant must not block the others.
    this.color = value.includes('/logo/') ? paletteColor(value) : value.includes('white') ? [255,255,255,255] : [25,25,25,255];
    queueMicrotask(() => { this.complete = true; if (value.includes('broken')) this.onerror?.(); else this.onload?.(); });
  }
}
function canvas() {
  const result = { width: 64, height: 64 };
  let color = [255,255,255,255], saved = [];
  const ctx = { canvas: result, fillStyle: '', globalAlpha: 1,
    clearRect() { color = [0,0,0,0]; },
    save() { saved.push([this.globalAlpha, this.fillStyle]); },
    restore() { [this.globalAlpha, this.fillStyle] = saved.pop(); }, scale() {}, translate() {},
    fillRect(x, y, w, height) {
      if (46 < x || 46 > x + w || 46 < y || 46 > y + height) return;
      const value = this.fillStyle.match(/[\d.]+/g).map(Number);
      const alpha = (value[3] ?? 1) * this.globalAlpha;
      color = color.map((v, i) => i === 3 ? 255 : v * (1 - alpha) + value[i] * alpha);
    },
    drawImage(image, ...args) {
      const [x, y, w, height] = args.length === 8 ? args.slice(4) : args;
      if (46 >= x && 46 <= x + w && 46 >= y && 46 <= y + height) color = image.color;
    },
    getImageData() { return { data: new Uint8ClampedArray(Array.from({ length: 64 * 64 }, () => color).flat()) }; },
  };
  result.getContext = () => ctx;
  return result;
}
const document = { ...eventTarget, hidden: false, documentElement: { root: true }, createElement: canvas,
  elementsFromPoint: () => [header, scroller] };
const { AdaptiveHeaderLogo } = load('components/adaptive-header-logo.tsx', {
  react: h.react, 'react/jsx-runtime': h.jsx, 'next/image': 'img',
  'next/navigation': { usePathname: () => '/series/tt123' }, 'next-themes': { useTheme: () => ({ resolvedTheme: 'light' }) },
  '@/lib/logo-contrast': contrast, '@/lib/logo-backdrop': backdrop, '@/lib/logo-surfaces': surfaces,
  './adaptive-header-logo.module.css': { frame: 'frame', mark: 'mark' },
}, { document, performance: { now: () => now },
  window: { ...eventTarget, Image: FakeImage, location: { origin: 'http://localhost:3000' },
    requestAnimationFrame: fn => { raf.set(++frame, fn); return frame; }, cancelAnimationFrame: id => raf.delete(id),
    getComputedStyle: element => element.root ? { getPropertyValue: () => 'rgb(255, 255, 255)' } : element.style },
  ResizeObserver: class { observe() {} disconnect() {} }, MutationObserver: class { observe() {} disconnect() {} },
});
const render = () => h.render(AdaptiveHeaderLogo, { adaptive: true });
function tick(time) { now = time; const work = [...raf.values()]; raf.clear(); work.forEach(fn => fn(time)); }
(async () => {
  render().props.ref.current = logo; h.flush();
  await new Promise(resolve => setImmediate(resolve));
  tick(0); await new Promise(resolve => setImmediate(resolve)); tick(50);
  assert.equal(render().props['data-logo-tone'], 'deep', 'Bright hero uses the dark high-contrast logo');
  hero.bounds.top = -500; poster.bounds.top = 0;
  tick(500); await new Promise(resolve => setImmediate(resolve)); tick(550);
  assert.equal(render().props['data-logo-tone'], 'light', 'A poster scrolled behind the logo is sampled after the hero leaves, even without another scroll event');
  assert.ok(requestedImages.some(source => source.includes('kind=poster') && source.includes('sample=1')), 'Posters also use readable same-origin bytes');
  assert.ok(raf.size, 'The idle sampler stays alive after the settling window');
  poster.src = '/broken.jpg'; tick(900); await new Promise(resolve => setImmediate(resolve)); tick(950);
  assert.ok(raf.size, 'An image failure cannot stop the sampler');
  poster.src = '/new-dark.jpg'; tick(1300); await new Promise(resolve => setImmediate(resolve)); tick(1350);
  assert.equal(render().props['data-logo-tone'], 'light', 'New content recovers after a failed image');
  const clipped = new Element('DIV', rect(250, 0, 200, 300), scroller, 2);
  clipped.style.overflowX = 'hidden'; poster.parentElement = clipped;
  tick(1600);
  assert.equal(render().props['data-logo-tone'], 'deep', 'Offscreen carousel images cannot affect the logo through an overflow clip');
  poster.parentElement = scroller;
  poster.bounds.top = 600; tick(1800);
  assert.equal(render().props['data-logo-tone'], 'deep', 'The real page background replaces artwork once it leaves the sampling region');
  document.hidden = true; tick(2000); assert.equal(raf.size, 0);
  document.hidden = false; listeners.get('visibilitychange')(); tick(2050); assert.ok(raf.size);
  const tree = render();
  assert.equal(tree.props.children.length, 4);
  assert.ok(tree.props.children.every(image => image.props.className === 'mark'), 'Every tone, including neutral, shares the same mounted transition layer');
  h.unmount(); assert.equal(raf.size, 0); assert.equal(listeners.size, 0);
  const css = require('postcss').parse(fs.readFileSync('components/adaptive-header-logo.module.css', 'utf8'));
  assert.ok(css.nodes.find(node => node.selector === '.mark').nodes.some(node => node.prop === 'transition' && node.value.includes('240ms')));
  assert.ok(css.nodes.find(node => node.params === '(prefers-reduced-motion: reduce)').nodes[0].nodes.some(node => node.prop === 'transition' && node.value.includes('opacity')));
  console.log('PASS: actual sampler follows hero → scrolled poster → page, continues idle, recovers from image failures, pauses hidden, cleans up, and crossfades all four variants.');
})().catch(error => { console.error(error); process.exitCode = 1; });
