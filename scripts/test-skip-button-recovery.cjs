const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, globals = {}) {
    const context = { exports: {}, ...globals };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText, context);
    return context.exports;
}

const utility = load('lib/media/skip-segments.ts');
const segments = [
    { kind: 'intro', start: 30, end: 90, provider: 'theintrodb' },
    { kind: 'recap', start: 100, end: 120, provider: 'introdb' },
    { kind: 'credits', start: 1800, end: 1850, provider: 'theintrodb' },
    { kind: 'credits', start: 1900, end: 2000, provider: 'theintrodb' },
];

function harness() {
    const slots = [], effects = [];
    let cursor = 0;
    const element = new EventTarget();
    element.currentTime = 45;
    element.closest = () => null;
    const ref = { current: element };
    const hooks = {
        useState(initial) {
            const at = cursor++;
            slots[at] ??= { value: at === 0 ? segments : typeof initial === 'function' ? initial() : initial };
            return [slots[at].value, value => { slots[at].value = typeof value === 'function' ? value(slots[at].value) : value; }];
        },
        useRef(initial) { return slots[cursor++] ??= { current: initial }; },
        useEffect(fn, deps) {
            const at = cursor++;
            if (!slots[at] || deps.some((dep, i) => dep !== slots[at].deps[i])) {
                slots[at]?.cleanup?.();
                slots[at] = { deps };
                // Seed the real fetched segments; only DOM/media effects run here.
                if (!fn.toString().includes('fetchSkipSegments')) effects.push(() => { slots[at].cleanup = fn(); });
            }
        },
    };
    const { PlayerSkipSegments } = load('components/player-skip-segments.tsx', {
        require: name => {
            if (name === 'react') return hooks;
            if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
            if (name === '@/lib/media/skip-segments') return utility;
            if (name.endsWith('.module.css')) return { __esModule: true, default: { button: 'skip-button' } };
            return new Proxy({}, { get: (_, key) => key === 'Button' ? 'button' : key });
        },
    });
    function button(node, label) {
        if (!node || typeof node !== 'object') return null;
        if (Array.isArray(node)) return node.map(child => button(child, label)).find(Boolean) || null;
        if (node.type === 'button' && !node.props.disabled && node.props.children.includes(label)) return node;
        return button(node.props?.children, label);
    }
    const render = time => {
        cursor = 0;
        element.currentTime = time;
        const tree = PlayerSkipSegments({
            lookup: { id: 'tt11280740', type: 'series', season: 1, episode: 1, duration: 2000 },
            currentTime: time, mediaRef: ref, onSeek() {},
        });
        effects.splice(0).forEach(fn => fn());
        return label => button(tree, label);
    };
    return { render, element };
}

const player = harness();
player.render(45)('Skip Intro').props.onClick({ stopPropagation() {} });
assert.equal(player.element.currentTime, 90);
assert.equal(player.render(90)('Skip Intro'), null);
assert.equal(player.render(45)('Skip Intro'), null, 'A stale native playhead echo must not resurrect the skipped intro');
assert.equal(player.render(89.95)('Skip Intro'), null, 'A seek landing just before the endpoint must not resurrect the skipped intro');
player.element.dispatchEvent(new Event('seeking'));
assert.equal(player.render(89.95)('Skip Intro'), null, 'Our own seek event cannot re-arm the intro');
player.element.dispatchEvent(new Event('seeked'));
assert.equal(player.render(89.95)('Skip Intro'), null, 'Finishing an imprecise seek does not re-arm the intro');
player.render(130);
player.element.currentTime = 50;
player.element.dispatchEvent(new Event('seeking'));
assert.ok(player.render(50)('Skip Intro'), 'A deliberate rewind into the intro makes Skip available again');
player.render(50)('Skip Intro').props.onClick({ stopPropagation() {} });
player.element.dispatchEvent(new Event('seeked'));
assert.ok(player.render(110)('Skip Recap'), 'Skipping intro does not suppress a later recap from the fallback');
player.render(110)('Skip Recap').props.onClick({ stopPropagation() {} });
assert.equal(player.render(119.95)('Skip Recap'), null);
player.element.dispatchEvent(new Event('seeked'));
player.render(1820)('Skip Credits').props.onClick({ stopPropagation() {} });
assert.equal(player.render(1849.95)('Skip Credits'), null);
assert.equal(player.render(1870)('Skip Credits'), null, 'Do not offer to skip a post-credit scene');
assert.ok(player.render(1920)('Skip Credits'), 'Later, separate credits remain skippable');
player.element.dispatchEvent(new Event('seeked'));
player.element.currentTime = 0;
player.element.dispatchEvent(new Event('seeking'));
assert.ok(player.render(45)('Skip Intro'), 'Rewinding before an intro also re-arms it when playback reaches the intro again');

const postcss = require('postcss');
const css = postcss.parse(fs.readFileSync('components/player-skip-segments.module.css', 'utf8'));
const base = css.nodes.find(rule => rule.selector === '.button');
const declarations = Object.fromEntries(base.nodes.map(node => [node.prop, node.value]));
assert.equal(declarations['box-shadow'], 'none');
assert.equal(declarations['backdrop-filter'], 'blur(6px)');
assert.equal(declarations.transform, undefined, 'Skip buttons never scale or move');
assert.ok(declarations.transition.includes('opacity 150ms var(--ease-out)'));
assert.ok(!declarations.transition.includes('transform'));
assert.ok(css.nodes.some(rule => rule.params === '(prefers-reduced-motion: reduce)'));
console.log('PASS: no skip-button reappearance after delayed seeks; deliberate rewinds, later segments, hidden controls, and restrained motion stay correct.');
