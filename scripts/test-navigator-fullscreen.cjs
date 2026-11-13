const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const { load, hooks } = require('./test-support/react-hooks.cjs');

function callback(file, name, globals) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) expression = node.initializer.getText(source);
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(expression, `${file}: ${name}`);
  const context = { exports: {}, console, setTimeout: fn => fn(), ...globals };
  vm.runInNewContext(ts.transpileModule(`exports.run = ${expression}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, context);
  return context.exports.run;
}
function find(tree, predicate) {
  if (!tree || typeof tree !== 'object') return undefined;
  if (predicate(tree)) return tree;
  for (const child of [tree.props?.children].flat(Infinity)) {
    const match = find(child, predicate);
    if (match) return match;
  }
}
async function sequence(platform, playing) {
  let open = false, exits = 0;
  const bridge = platform ? { platform, send: command => { if (command.type === 'fullscreen' && !command.value) exits++; } } : undefined;
  const setOpen = next => { open = typeof next === 'function' ? next(open) : next; };
  const document = { exitFullscreen: async () => { exits++; } };
  const common = { desktopBridge: () => bridge, document, setIsAIAskOpen: setOpen, setIsAskOpen: setOpen };
  const cold = callback('components/layout-content.tsx', 'handleToggleAIAsk', {
    ...common, isFullscreen: true, isAIAskOpen: false, isPlayerVisible: playing,
  });
  const host = hooks();
  const { DeferredTools } = load('components/deferred-tools.tsx', {
    react: host.react, 'react/jsx-runtime': host.jsx,
    'next/dynamic': { __esModule: true, default: factory => factory.toString().includes('global-media-player') ? 'Player' : 'Navigator' },
    jotai: { useAtomValue: atom => atom === 'playing' ? playing : open },
    '@/lib/atoms': { isPlayerVisibleAtom: 'playing', isAIAskOpenAtom: 'open' },
    '@/components/navigator/launcher': { NavigatorLauncher: 'Launcher' },
    '@/lib/preload-tools': { preloadPlayer() {}, preloadNavigator() {} },
    '@/lib/desktop/bridge': { desktopBridge: () => bridge },
    'lucide-react': { ArrowLeft: 'ArrowLeft' },
  });
  const render = () => host.render(DeferredTools, { userId: 'fixture', navigatorEnabled: true, onToggleAIAsk: cold });
  const initial = render();
  const launcher = find(initial, node => node.type === (playing ? 'Player' : 'Launcher'));
  assert.ok(launcher, 'First open uses the layout callback before Navigator mounts');
  await (playing ? launcher.props.onToggleAIAsk : launcher.props.onClick)();
  const firstExits = exits;
  assert.equal(open, true);
  assert.ok(find(render(), node => node.type === 'Navigator'), 'First request mounts Navigator');
  setOpen(false);
  assert.ok(find(render(), node => node.type === 'Navigator'), 'Closing keeps Navigator mounted');
  // Native window fullscreen is not document.fullscreenElement. The mounted
  // AIAsk component derives its local fullscreen flag only from the document.
  const warm = callback('components/navigator/ai-ask.tsx', 'handleOpenAsk', {
    ...common, isFullscreen: !platform, isAskOpen: false,
  });
  await (playing ? cold : warm)();
  assert.equal(open, true);
  const laterExits = exits - firstExits;
  console.log(`${platform ?? 'browser'}, playing=${playing}: first exits=${firstExits}, later exits=${laterExits}`);
  assert.equal(firstExits, platform ? 0 : 1, 'First open must preserve native window fullscreen');
  assert.equal(laterExits, platform ? 0 : 1, 'Later opens must preserve native window fullscreen');
  // A WebView can also report a DOM fullscreen element. Native window state
  // must still stay untouched when the mounted launcher opens.
  if (platform) {
    setOpen(false);
    await callback('components/navigator/ai-ask.tsx', 'handleOpenAsk', {
      ...common, isFullscreen: true, isAskOpen: false,
    })();
    assert.equal(exits, 0);
  }
}
(async () => {
  for (const platform of ['windows', 'macos', undefined]) {
    for (const playing of [false, true]) await sequence(platform, playing);
  }
  console.log('PASS: actual deferred cold/warm launcher paths preserve native fullscreen in browsing and playback; browser overlay fallback remains available.');
})().catch(error => { console.error(error); process.exitCode = 1; });
