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
        dispatch(name) { listeners.get(name)?.(); },
        get listenerCount() { return listeners.size; },
    };
}
function overscroll() {
    const clock = frames();
    let effect, resizeCallback, disconnected = false, removed = false;
    const children = [];
    const parent = { append(node) { children.push(node); } };
    const scroller = target({ scrollTop: 0, offsetTop: 0, offsetLeft: 0, clientWidth: 1200, clientHeight: 900, parentElement: parent });
    const image = target({ style: { transform: '' }, complete: true, naturalWidth: 1920, naturalHeight: 1080, clientWidth: 1200, clientHeight: 500, closest: () => scroller });
    let draws = 0;
    let canvas;
    const motionPreference = target({ matches: false });
    const document = { createElement(tag) {
        const node = { tag, style: { transform: '' }, setAttribute() {}, append() {}, remove() { removed = true; },
            getContext: () => ({ drawImage() { draws++; } }),
        };
        if (tag === 'canvas') canvas = node;
        return node;
    } };
    const { useBackdropOverscroll } = load('components/media-page/use-backdrop-overscroll.ts', name => {
        if (name === 'react') return { useEffect: fn => { effect = fn; } };
        if (name === '@/lib/logo-contrast') return { getLogoSampleCrop: () => ({ x: 0, y: 0, width: 1920, height: 1080 }) };
        return { default: {} };
    }, { ...clock, document, matchMedia: () => motionPreference, devicePixelRatio: 3, getComputedStyle: () => ({ objectPosition: '50% 50%' }), ResizeObserver: class {
        constructor(fn) { resizeCallback = fn; }
        observe() {}
        disconnect() { disconnected = true; }
    } });
    useBackdropOverscroll({ current: image }, '/fixture.jpg');
    const cleanup = effect();
    const surface = children[0];
    assert.equal(surface.style.visibility, 'hidden', 'Never expose an unpainted canvas');
    clock.flush();
    assert.equal(surface.style.visibility, 'visible');
    for (const scrollTop of [1, 100, 900, 0, -20, 1, 0, -60, 0]) {
        scroller.scrollTop = scrollTop;
        scroller.dispatch('scroll');
        clock.flush();
        const scale = 1 + Math.max(0, -scrollTop) / image.clientHeight;
        assert.equal(image.style.transform, scale === 1 ? '' : `scale(${scale})`);
        assert.equal(canvas.style.transform, scale === 1 ? '' : `scale(${scale})`);
        assert.ok(Math.abs(Math.max(0, -scrollTop) + image.clientHeight * (1 - scale)) < 1e-8,
            'Bottom-anchored artwork cancels native downward motion at the viewport top');
        assert.equal(surface.style.visibility, 'visible', 'A ready backing must remain painted across scroll/bounce boundaries; native scrolling may outrun JS');
    }
    assert.equal(draws, 1, 'Scrolling must not repaint the backing canvas');
    assert.equal(scroller.listenerCount, 1, 'One passive scroll handler drives transforms; visibility remains independent');
    assert.ok(canvas.width <= 2048 && canvas.height <= 2048, 'Raster memory stays bounded even on high-DPI screens');
    assert.equal(canvas.style.height, '500px');
    scroller.scrollTop = -100;
    scroller.dispatch('scroll'); clock.flush();
    assert.equal(image.style.transform, 'scale(1.2)');
    motionPreference.matches = true;
    motionPreference.dispatch('change');
    assert.equal(image.style.transform, '', 'Enabling Reduce Motion immediately removes stretch during a pull');
    scroller.scrollTop = -150; scroller.dispatch('scroll'); clock.flush();
    assert.equal(image.style.transform, '');
    motionPreference.matches = false; motionPreference.dispatch('change');
    assert.equal(image.style.transform, 'scale(1.3)', 'Turning motion back on resumes at the current native position');
    assert.equal(draws, 1, 'Neither preference changes nor native bounce redraw the bitmap');
    resizeCallback(); clock.flush();
    assert.equal(draws, 2, 'Geometry changes still refresh the sampled strip');
    image.dispatch('error');
    assert.equal(surface.style.visibility, 'hidden', 'Broken artwork is never exposed');
    cleanup();
    assert.ok(disconnected && removed);
    assert.equal(image.listenerCount, 0);
    assert.equal(scroller.listenerCount, 0);
    assert.equal(motionPreference.listenerCount, 0);
    assert.equal(image.style.transform, '', 'Source teardown restores the original artwork transform');
    assert.equal(clock.size, 0);
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
console.log('PASS: native-distance backdrop stretching, seamless top anchoring, bounded raster size, reduced motion, and stable scroll surfaces without per-scroll canvas work or leaked listeners.');
