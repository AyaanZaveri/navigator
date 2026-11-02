const assert = require('node:assert/strict');
const { load, hooks } = require('./test-support/react-hooks.cjs');
const h = hooks();
const atoms = { isPlayerVisibleAtom: 'player', isAIAskOpenAtom: 'ask' };
let playing = false, open = false, preloads = 0;
const dynamicComponents = [];
const { DeferredTools } = load('components/deferred-tools.tsx', {
  react: h.react, 'react/jsx-runtime': h.jsx,
  'next/dynamic': { __esModule: true, default: (_loader, options) => {
    function LazyTool() {}
    LazyTool.options = options; dynamicComponents.push(LazyTool); return LazyTool;
  } },
  jotai: { useAtomValue: atom => atom === 'player' ? playing : open, useAtom: () => [open, () => {}] },
  '@/lib/atoms': atoms,
  '@/components/navigator/launcher': { NavigatorLauncher: 'Launcher' },
  '@/lib/preload-tools': { preloadNavigator: () => preloads++ },
  '@/lib/desktop/bridge': { desktopBridge: () => undefined },
});
const render = enabled => h.render(DeferredTools, { userId: 'user-1', navigatorEnabled: enabled, onToggleAIAsk() {} });
const children = tree => tree.props.children.filter(Boolean);
let tree = render(true);
h.flush();
assert.equal(children(tree).length, 1, 'Only the lightweight launcher is mounted before first use');
assert.equal(children(tree).some(child => dynamicComponents.includes(child.type)), false);
children(tree)[0].props.children.props.children.props.onIntent();
assert.equal(preloads, 1);
playing = true; tree = render(true);
assert.equal(children(tree).find(child => child.type === dynamicComponents[0]).props.onToggleAIAsk instanceof Function, true);
playing = false; tree = render(true);
assert.ok(children(tree).some(child => child.type === dynamicComponents[0]), 'Player remains mounted after closing so lifecycle and stop reporting survive');
open = true; tree = render(true);
assert.equal(children(tree).some(child => child.type === dynamicComponents[1]), true);
assert.equal(children(tree).some(child => child.type === 'div'), false, 'The initial launcher cannot duplicate the loaded panel launcher');
open = false; tree = render(true);
assert.equal(children(tree).some(child => child.type === dynamicComponents[1]), true, 'Chat remains mounted across close/reopen');
assert.equal(children(render(false)).some(child => child.type === dynamicComponents[1]), false, 'Disabled Navigator releases its UI');
assert.equal(dynamicComponents[0].options.ssr, false);
assert.equal(dynamicComponents[0].options.loading(), null, 'Cold player chunks must not add a separate Opening player screen');
assert.equal(dynamicComponents[1].options.ssr, false);
assert.equal(typeof dynamicComponents[1].options.loading, 'function', 'A cold AI chunk has immediate loading feedback');

function warmup(platform, idleSupported = true) {
  const native = hooks(), pending = new Map();
  let preloaded = 0, sequence = 0;
  const schedule = fn => { pending.set(++sequence, fn); return sequence; };
  const cancel = id => pending.delete(id);
  const { DeferredTools: NativeTools } = load('components/deferred-tools.tsx', {
    react: native.react, 'react/jsx-runtime': native.jsx,
    'next/dynamic': { __esModule: true, default: () => function LazyTool() {} },
    jotai: { useAtomValue: () => false, useAtom: () => [false, () => {}] },
    '@/lib/atoms': atoms,
    '@/components/navigator/launcher': { NavigatorLauncher: 'Launcher' },
    '@/lib/preload-tools': { preloadNavigator() {}, preloadPlayer: () => preloaded++ },
    '@/lib/desktop/bridge': { desktopBridge: () => platform ? { platform } : undefined },
  }, { window: {
    ...(idleSupported ? { requestIdleCallback: schedule, cancelIdleCallback: cancel } : {}),
    setTimeout: schedule, clearTimeout: cancel,
  } });
  native.render(NativeTools, { userId: 'native-user', navigatorEnabled: false, onToggleAIAsk() {} });
  native.flush();
  return { pending, native, get preloaded() { return preloaded; },
    run() { const work = [...pending.values()]; pending.clear(); work.forEach(fn => fn()); } };
}
for (const platform of [undefined, 'macos', 'ios']) {
  const client = warmup(platform);
  assert.equal(client.pending.size, 0, 'Idle warmup is limited to the Android playback entry point');
  assert.equal(client.preloaded, 0);
  client.native.unmount();
}
for (const idleSupported of [true, false]) {
  const client = warmup('android', idleSupported);
  assert.equal(client.preloaded, 0, 'Android warmup leaves the initial shell render free');
  assert.equal(client.pending.size, 1);
  client.run();
  assert.equal(client.preloaded, 1, 'Android warms the player before the first Play tap');
  client.native.replay();
  assert.equal(client.pending.size, 1);
  client.native.unmount();
  assert.equal(client.pending.size, 0, 'Unmounting cancels scheduled work, including Strict Mode replays');
}
console.log('PASS: cold tools stay unmounted, intent preload, first-open activation, stable close/reopen state, loading feedback and disabled Navigator.');
