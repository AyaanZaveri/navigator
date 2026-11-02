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
});
const render = enabled => h.render(DeferredTools, { userId: 'user-1', navigatorEnabled: enabled, onToggleAIAsk() {} });
const children = tree => tree.props.children.filter(Boolean);
let tree = render(true);
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
assert.equal(dynamicComponents[1].options.ssr, false);
assert.equal(typeof dynamicComponents[1].options.loading, 'function', 'A cold AI chunk has immediate loading feedback');
console.log('PASS: cold tools stay unmounted, intent preload, first-open activation, stable close/reopen state, loading feedback and disabled Navigator.');
