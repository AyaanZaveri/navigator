const assert = require('node:assert/strict');
const { load, hooks } = require('./test-support/react-hooks.cjs');

function harness(count = 6) {
  const h = hooks(), requests = [], observers = [];
  const timers = new Map(); let timerId = 0;
  const root = new EventTarget();
  root.scrollTop = 0;
  const sentinel = { closest: () => root };
  const entries = Array.from({ length: count }, (_, i) => ({ key: String(i), sectionName: `Catalog ${i}`, catalogType: 'movie', catalogId: String(i), addonTransportUrl: 'https://addon.test/manifest.json' }));
  const { HomeCatalogSectionsLazy } = load('components/home-catalog-sections-lazy.tsx', {
    react: h.react, 'react/jsx-runtime': h.jsx,
    '@/components/media-section': { MediaSection: 'MediaSection' },
    '@/components/ui/loading-placeholder': { LoadingPlaceholder: 'LoadingPlaceholder' },
    '@/components/ui/skeleton': { Skeleton: 'Skeleton' }, '@/components/ui/button': { Button: 'button' },
  }, {
    AbortController, AbortSignal,
    setTimeout(callback) { timers.set(++timerId, callback); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    console: { error() {} },
    window: new EventTarget(),
    IntersectionObserver: class {
      constructor(callback, options) { this.callback = callback; this.options = options; this.active = true; observers.push(this); }
      observe() { queueMicrotask(() => this.emit(true)); }
      disconnect() { this.active = false; }
      emit(isIntersecting) { if (this.active) this.callback([{ isIntersecting }]); }
    },
    fetch: (url, options) => new Promise(resolve => requests.push({ url, options, entries: JSON.parse(options.body).entries, resolve })),
  });
  const props = { initialSections: [], remainingEntries: entries, batchSize: 2 };
  let tree, rendered = -1;
  function nodes(node, predicate) {
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node)) return node.flatMap(child => nodes(child, predicate));
    return [...(predicate(node) ? [node] : []), ...nodes(node.props?.children, predicate)];
  }
  const render = () => {
    tree = h.render(HomeCatalogSectionsLazy, props);
    for (const node of nodes(tree, node => node.props?.ref)) node.props.ref.current = sentinel;
    rendered = h.updates; h.flush();
  };
  return {
    requests, observers, h,
    async settle() { for (let i = 0; i < 35; i++) { if (rendered !== h.updates) render(); await Promise.resolve(); } },
    intersect(value = true) { observers.at(-1).emit(value); },
    wheel(deltaY = 100) { root.dispatchEvent(Object.assign(new Event('wheel'), { deltaY })); },
    endGesture() { const work = [...timers.values()]; timers.clear(); work.forEach(callback => callback()); },
    touch(type, y) { root.dispatchEvent(Object.assign(new Event(type), { touches: [{ clientY: y }] })); },
    drag(top, start = false) {
      if (start) root.dispatchEvent(new Event('pointerdown'));
      root.scrollTop = top; root.dispatchEvent(new Event('scroll'));
    },
    key(key) { root.dispatchEvent(Object.assign(new Event('keydown'), { key })); },
    manual() { nodes(tree, node => node.type === 'button')[0].props.onClick(); },
    answer(index, sections = [], status = 200) { requests[index].resolve(Response.json({ sections }, { status })); },
    get tree() { return tree; },
  };
}

(async () => {
  const page = harness(); await page.settle();
  assert.equal(page.requests.length, 1);
  page.intersect(); page.intersect(); await page.settle();
  assert.equal(page.requests.length, 1, 'Repeated observer notifications cannot overlap requests');
  page.intersect(false); page.intersect(true); // Loading skeleton changes layout.
  page.answer(0); await page.settle(); // Empty catalogs leave the sentinel visible.
  assert.equal(page.requests.length, 1, 'Completing a batch must not cascade into the next request');
  assert.equal(page.observers.length, 1, 'Loading state cannot recreate the observer');
  assert.equal(page.observers[0].options.root instanceof EventTarget, true, 'Observe the actual page scroll container');
  page.intersect(false); page.intersect(true); await page.settle();
  assert.equal(page.requests.length, 1, 'Layout-only exit/re-entry cannot re-arm automatic loading');
  page.wheel(-100); await page.settle();
  assert.equal(page.requests.length, 1, 'Scrolling upward does not request another batch');
  page.wheel(); await page.settle();
  assert.equal(page.requests.length, 2, 'Continued downward user input requests the next needed batch');
  assert.deepEqual(page.requests[1].entries.map(entry => entry.key), ['2', '3']);
  page.answer(1, [], 500); await page.settle();
  page.intersect(); page.wheel(); await page.settle();
  assert.equal(page.requests.length, 2, 'A failed request must wait for explicit Retry');
  page.manual(); page.manual(); await page.settle();
  assert.equal(page.requests.length, 3, 'Rapid Retry clicks remain single-flight');
  assert.deepEqual(page.requests[2].entries.map(entry => entry.key), ['2', '3'], 'Retry keeps the failed cursor');
  page.answer(2); await page.settle();
  page.key('PageDown'); await page.settle();
  assert.equal(page.requests.length, 4, 'Keyboard scrolling can continue automatic pagination');
  assert.deepEqual(page.requests[3].entries.map(entry => entry.key), ['4', '5']);
  page.answer(3); await page.settle();
  page.wheel(); page.intersect(); await page.settle();
  assert.equal(page.requests.length, 4, 'Exhausted catalogs stop loading');
  page.h.unmount();

  const gestures = harness(12); await gestures.settle();
  gestures.wheel(); // Same scroll burst continues while the batch is loading.
  gestures.answer(0); await gestures.settle();
  gestures.wheel(); await gestures.settle();
  assert.equal(gestures.requests.length, 1, 'Momentum from the first scroll cannot drain another batch');
  gestures.endGesture(); gestures.wheel(); await gestures.settle();
  assert.equal(gestures.requests.length, 2, 'A fresh scroll burst continues loading');
  gestures.answer(1); await gestures.settle();
  gestures.touch('touchstart', 200); gestures.touch('touchmove', 150); await gestures.settle();
  assert.equal(gestures.requests.length, 3);
  gestures.answer(2); await gestures.settle();
  gestures.touch('touchmove', 100); await gestures.settle();
  assert.equal(gestures.requests.length, 3, 'One touch gesture cannot keep chaining batches');
  gestures.touch('touchstart', 200); gestures.touch('touchmove', 100); await gestures.settle();
  assert.equal(gestures.requests.length, 4, 'A fresh touch swipe continues loading');
  gestures.answer(3); await gestures.settle();
  gestures.drag(100, true); await gestures.settle();
  assert.equal(gestures.requests.length, 5, 'Dragging the scrollbar also supports automatic loading');
  gestures.answer(4); await gestures.settle();
  gestures.drag(200); await gestures.settle();
  assert.equal(gestures.requests.length, 5, 'A held scrollbar drag cannot cascade either');
  gestures.drag(300, true); await gestures.settle();
  assert.equal(gestures.requests.length, 6);
  gestures.answer(5); await gestures.settle(); gestures.h.unmount();

  const cancelled = harness(); await cancelled.settle();
  const before = cancelled.h.updates;
  cancelled.h.unmount();
  assert.equal(cancelled.requests[0].options.signal.aborted, true, 'Leaving the page cancels the pending request');
  cancelled.answer(0); await Promise.resolve(); await Promise.resolve();
  assert.equal(cancelled.h.updates, before, 'A stale response cannot update an unmounted page');
  console.log('PASS: no observer/skeleton/empty-page cascades, user-paced loading, single-flight requests, explicit retry, cursor exhaustion, and cancellation.');
})().catch(error => { console.error(error); process.exitCode = 1; });
