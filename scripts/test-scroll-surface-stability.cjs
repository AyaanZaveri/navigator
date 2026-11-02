const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const postcss = require('postcss');
function load(file, requireFn, globals) {
    const context = { exports: {}, require: requireFn, ...globals };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText, context);
    return context.exports;
}
function frames() {
    let next = 0;
    const pending = new Map();
    return {
        requestAnimationFrame(fn) { pending.set(++next, fn); return next; },
        cancelAnimationFrame(id) { pending.delete(id); },
        flush() { const batch = [...pending.values()]; pending.clear(); batch.forEach(fn => fn()); },
        get size() { return pending.size; },
    };
}
function target(extra = {}) {
    const listeners = new Map();
    return { ...extra,
        addEventListener(name, callback) { listeners.set(name, callback); },
        removeEventListener(name, callback) { if (listeners.get(name) === callback) listeners.delete(name); },
        dispatch(name, event) { listeners.get(name)?.(event); },
        get listenerCount() { return listeners.size; },
    };
}
function overscroll() {
    const clock = frames(), timers = new Map(), springs = [];
    let timerId = 0, now = 100;
    let effect, resizeCallback, disconnected = false, removed = false;
    class FakeHTMLElement {}
    const contentNodes = [Object.assign(new FakeHTMLElement(), { style: { transform: '' } }),
        Object.assign(new FakeHTMLElement(), { style: { transform: '' } })];
    const page = { children: [...contentNodes], prepend(node) { this.children.unshift(node); } };
    const parent = {};
    const scroller = target({ style: { transform: '', overscrollBehaviorY: 'contain' }, scrollTop: 0,
        offsetTop: 0, offsetLeft: 0, clientWidth: 1200, clientHeight: 900, parentElement: parent });
    const image = target({ style: { transform: '' }, complete: true, naturalWidth: 1920, naturalHeight: 1080,
        clientWidth: 1200, clientHeight: 500, closest: selector => selector === 'main' ? scroller : page });
    let draws = 0, canvas;
    const motionPreference = target({ matches: false });
    const document = { createElement(tag) {
        const node = { tag, style: { transform: '' }, setAttribute() {}, append() {}, remove() { removed = true; },
            getContext: () => ({ drawImage() { draws++; } }) };
        if (tag === 'canvas') canvas = node;
        return node;
    } };
    const tokens = load('components/arc/motion-tokens.ts', () => ({}), {}).motionTokens;
    const controller = load('lib/media/backdrop-stretch.ts', name => {
        if (name === '@/components/arc/motion-tokens') return { motionTokens: tokens };
        if (name === 'motion') return { animate(from, to, options) {
            const spring = { from, to, options, stopped: false, stop() { this.stopped = true; } };
            springs.push(spring); return spring;
        } };
        throw new Error(name);
    }, { Element: class {}, getComputedStyle: () => ({ overflowY: 'visible' }), performance: { now: () => now += 16 },
        setTimeout(fn) { timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); } });
    const { useBackdropOverscroll } = load('components/media-page/use-backdrop-overscroll.ts', name => {
        if (name === 'react') return { useEffect: fn => { effect = fn; } };
        if (name === '@/lib/media/backdrop-stretch') return controller;
        if (name === '@/lib/logo-contrast') return { getLogoSampleCrop: () => ({ x: 0, y: 0, width: 1920, height: 1080 }) };
        return { default: { page: 'page' } };
    }, { ...clock, document, HTMLElement: FakeHTMLElement, matchMedia: () => motionPreference, devicePixelRatio: 3,
        getComputedStyle: () => ({ objectPosition: '50% 50%' }), ResizeObserver: class {
            constructor(fn) { resizeCallback = fn; } observe() {} disconnect() { disconnected = true; }
        } });
    useBackdropOverscroll({ current: image }, '/fixture.jpg');
    const cleanup = effect(), surface = page.children[0];
    assert.equal(surface.style.visibility, 'hidden', 'Never expose an unpainted canvas');
    clock.flush();
    assert.equal(surface.style.visibility, 'visible');
    assert.equal(scroller.style.overscrollBehaviorY, 'none', 'Prevent a second OS bounce fighting the controlled stretch');
    function wheel(deltaY, extra = {}) {
        const event = { deltaY, deltaX: 0, deltaMode: 0, prevented: false, preventDefault() { this.prevented = true; }, ...extra };
        scroller.dispatch('wheel', event); return event;
    }
    function pullDistance() { return Number(/translateY\(([^p]+)px\)/.exec(contentNodes[0].style.transform)?.[1] || 0); }
    assert.equal(wheel(-100).prevented, true);
    let pull = pullDistance();
    assert.ok(pull > 0 && pull < 100, 'Wheel pull works when Chrome keeps scrollTop at zero, with progressive resistance');
    assert.equal(scroller.scrollTop, 0);
    const scale = 1 + pull / image.clientHeight;
    assert.equal(image.style.transform, `scale(${scale})`);
    assert.equal(canvas.style.transform, `scale(${scale})`);
    assert.ok(Math.abs(pull + image.clientHeight * (1 - scale)) < 1e-8, 'Only one aligned artwork view is revealed at the top');
    wheel(-100); assert.ok(pullDistance() > pull);
    assert.equal(draws, 1, 'Input updates must never rerasterize the backing');
    assert.equal(timers.size, 0, 'Wheel input never waits for a quiet/debounce interval');
    assert.ok(springs.length >= 2, 'Every wheel impulse immediately starts returning home');
    assert.equal(scroller.style.transform, '', 'Keep the fixed aurora outside every translated ancestor');
    const clippedBottom = Number(/inset\(0px 0px ([^p]+)px/.exec(surface.style.clipPath)[1]);
    assert.ok(Math.abs(900 - clippedBottom - pullDistance()) < 1e-8, 'Expose just the gap, not a duplicate full image');
    const spring = springs.at(-1);
    assert.equal(spring.to, 0); assert.equal(spring.options.bounce, 0);
    assert.ok(spring.options.velocity <= 0, 'A released pull must not keep moving outward');
    assert.equal(spring.options.visualDuration, tokens.spring.snappy.visualDuration);
    spring.options.onUpdate(30);
    wheel(-20);
    assert.equal(spring.stopped, true, 'A new pull interrupts the return from its current displayed position');
    assert.ok(pullDistance() > 30);
    wheel(1000);
    assert.equal(pullDistance(), 0, 'Reverse input gives control back to normal scrolling');
    assert.ok(scroller.scrollTop > 0);
    assert.equal(wheel(20).prevented, false, 'Normal downward scrolling remains native');
    assert.equal(wheel(-5).prevented, false, 'Normal upward scrolling away from the boundary remains native');
    scroller.scrollTop = 0;
    assert.equal(wheel(-100, { ctrlKey: true }).prevented, false, 'Pinch/ctrl zoom stays native');
    assert.equal(wheel(-100, { deltaX: 200 }).prevented, false, 'Horizontal gestures stay native');
    motionPreference.matches = true; motionPreference.dispatch('change');
    assert.equal(wheel(-100).prevented, false);
    assert.equal(image.style.transform, '');
    motionPreference.matches = false; motionPreference.dispatch('change');
    const touchEvent = (x, y) => ({ touches: [{ clientX: x, clientY: y }], prevented: false, preventDefault() { this.prevented = true; } });
    scroller.dispatch('touchstart', touchEvent(50, 100));
    const tap = touchEvent(50, 103); scroller.dispatch('touchmove', tap);
    assert.equal(tap.prevented, false, 'A tap is not mistaken for a pull');
    const drag = touchEvent(50, 160); scroller.dispatch('touchmove', drag);
    assert.equal(drag.prevented, true); assert.ok(pullDistance() > 0, 'The same stretch is available to touch/webview input');
    scroller.dispatch('touchend');
    assert.equal(springs.at(-1).to, 0);
    motionPreference.matches = true; motionPreference.dispatch('change');
    assert.equal(pullDistance(), 0, 'Reduce Motion immediately removes a current stretch');
    assert.equal(draws, 1);
    assert.ok(canvas.width <= 2048 && canvas.height <= 2048);
    resizeCallback(); clock.flush(); assert.equal(draws, 2);
    image.dispatch('error'); assert.equal(surface.style.visibility, 'hidden');
    cleanup();
    assert.ok(disconnected && removed);
    assert.equal(image.listenerCount, 0); assert.equal(scroller.listenerCount, 0);
    assert.equal(motionPreference.listenerCount, 0);
    assert.equal(scroller.style.overscrollBehaviorY, 'contain');
    assert.equal(scroller.style.transform, ''); assert.equal(image.style.transform, '');
    assert.ok(contentNodes.every(node => node.style.transform === ''));
    assert.equal(clock.size, 0); assert.equal(timers.size, 0);
}

function header() {
    const clock = frames(), effects = [], layers = Array.from({ length: 6 }, () => ({ style: {} }));
    const scroller = target({ scrollTop: 0 });
    const layout = { style: { setProperty() {} } };
    const header = { closest: () => layout, parentElement: { querySelector: () => scroller }, getBoundingClientRect: () => ({ height: 100 }) };
    const surface = { querySelectorAll: () => layers };
    let refs = 0;
    const { AppHeader } = load('components/app-header.tsx', name => {
        if (name === 'react') return { ...React, useRef: () => ({ current: refs++ === 0 ? header : surface }), useLayoutEffect: fn => effects.push(fn) };
        if (name === 'react/jsx-runtime') return require(name);
        if (name === '@/contexts/MediaPlayerContext') return { useIsPlayerVisible: () => false };
        return new Proxy({}, { get: (_, key) => key });
    }, { ...clock, ResizeObserver: class { observe() {} disconnect() {} } });
    AppHeader({ email: 'fixture@example.invalid', overlay: true });
    const cleanup = effects[0]();
    for (let pass = 0; pass < 100; pass++) {
        for (const top of [0, 0.1, 1, 96, 192, 600, 1, 0, -20]) {
            scroller.scrollTop = top;
            scroller.dispatch('scroll'); clock.flush();
            for (const layer of layers) {
                assert.equal(layer.style.visibility, undefined, 'Header scroll fades must not tear down backdrop-filter layers at zero');
                assert.ok(Number(layer.style.opacity) >= 0 && Number(layer.style.opacity) <= 1);
            }
        }
    }
    scroller.scrollTop = 600; scroller.dispatch('scroll'); clock.flush();
    scroller.dispatch('scroll');
    assert.equal(clock.size, 0, 'Fully faded-in header does not schedule redundant frames');
    cleanup();
    assert.equal(scroller.listenerCount, 0);
    const css = postcss.parse(fs.readFileSync('components/app-header.module.css', 'utf8'));
    css.walkRules(rule => {
        if (rule.selector === '.blur > div,\n.tint') {
            assert.ok(!rule.nodes.some(node => node.prop === 'visibility'));
            assert.ok(!rule.nodes.some(node => node.prop === 'transition' && node.value.includes('visibility')));
        }
    });
}
overscroll();
header();
console.log('PASS: cross-browser wheel/touch stretching, spring interruption, seamless top anchoring, bounded raster size, reduced motion, and stable scroll surfaces without per-scroll canvas work or leaked listeners.');
