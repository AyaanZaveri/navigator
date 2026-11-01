// Exercise the real SeekPreview entry point with a deterministic moving finger.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
let now = 1000, id = 0, cursor = 0;
const hooks = [], timers = new Map(), effects = [];
const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
const react = {
  useState(initial) {
    const index = cursor++;
    hooks[index] ??= { value: typeof initial === 'function' ? initial() : initial };
    return [hooks[index].value, value => { hooks[index].value = typeof value === 'function' ? value(hooks[index].value) : value; }];
  },
  useLayoutEffect(effect, deps) {
    const index = cursor++, previous = hooks[index];
    if (!same(previous?.deps, deps)) effects.push(() => { previous?.cleanup?.(); hooks[index] = { deps, cleanup: effect() }; });
  },
};
const context = { exports: {}, setTimeout(fn, delay) { timers.set(++id, { fn, at: now + delay }); return id; }, clearTimeout(id) { timers.delete(id); }, require(name) {
  if (name === 'react') return react;
  if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
  return {};
} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/seek-preview.tsx', 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText, context);
let time = 10, active = true, deferWhileMoving = true;
function render() {
  cursor = 0;
  const node = context.exports.SeekPreview({ media: null, time, duration: 120, active, deferWhileMoving });
  while (effects.length) effects.shift()();
  return node.props;
}
function advance(ms) {
  now += ms;
  for (const [key, task] of [...timers]) if (task.at <= now) { timers.delete(key); task.fn(); }
}
for (let step = 0; step < 24; step++) {
  time += .05; // Fine movement stays within one two-second thumbnail bucket.
  assert.equal(render().active, false, 'Surface movement must not start thumbnail decoding, including the first request');
  advance(16);
}
advance(163); // The final move was followed by one 16ms display frame.
assert.equal(render().active, false, 'Wait for 180ms of finger inactivity');
advance(1);
assert.equal(render().active, true, 'A stationary held finger requests the current thumbnail');
time += .05;
assert.equal(render().active, false, 'Resuming movement immediately suspends extraction again');
active = false; render(); advance(500);
assert.equal(render().active, false, 'Release cannot start a delayed thumbnail');
active = true; deferWhileMoving = false;
assert.equal(render().active, true, 'Direct timeline dragging retains immediate previews');
const css = fs.readFileSync('components/player-mobile.css', 'utf8');
const range = css.match(/\[data-scrub-mode="surface"\] \[data-slot="media-player-seek-range"\]\s*\{([^}]+)\}/)[1];
assert.ok(!/transition:\s*(right|all)/.test(range), 'Surface playhead must track the finger without a trailing position transition');
const player = fs.readFileSync('components/ui/media-player.tsx', 'utf8');
assert.ok(!player.includes('% speed'), 'Scrubbing must not display speed percentages');
assert.match(player, /<SeekPreview[^>]*deferWhileMoving=/, 'The actual timeline must enable the idle policy for surface gestures');
console.log('PASS: surface thumbnails wait for inactivity, fine movements reset the timer, release cancels work, bar previews stay immediate, and the playhead has no easing delay');
