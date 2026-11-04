const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { load } = require('./test-support/react-hooks.cjs');
const sent = [];
let bridge;
const { setMacOSWindowControlsVisible } = load('lib/desktop/bridge.ts', {}, {
  window: { get navigatorDesktop() { return bridge; } },
});
for (const platform of ['macos', 'windows', 'linux', 'ios', 'android']) {
  for (const supported of [true, false]) {
    bridge = { protocol: 1, platform, capabilities: { windowControlsVisibility: supported }, send: request => sent.push(request) };
    const before = sent.length;
    setMacOSWindowControlsVisible(false);
    assert.equal(sent.length - before, platform === 'macos' && supported ? 1 : 0);
  }
}
bridge = undefined; setMacOSWindowControlsVisible(true);
bridge = { protocol: 1, platform: 'macos', send: request => sent.push(request) };
setMacOSWindowControlsVisible(false);
assert.equal(sent.length, 1, 'Older runtimes must not receive unknown commands');
bridge.capabilities = { windowControlsVisibility: true };
sent.length = 0;
// Execute the actual component effects: idle hide, pointer reveal, and leaving
// playback while controls are hidden must restore browsing window controls.
const source = fs.readFileSync('components/ui/media-player.tsx', 'utf8');
const ast = ts.createSourceFile('player.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const effects = [];
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'React.useEffect' &&
      node.arguments[0]?.getText(ast).includes('setMacOSWindowControlsVisible')) effects.push(node.arguments[0].getText(ast));
  ts.forEachChild(node, visit);
}
visit(ast); assert.equal(effects.length, 2);
function run(effect, visible) {
  return vm.runInNewContext(ts.transpileModule(`(${effect})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText,
    { controlsVisible: visible, setMacOSWindowControlsVisible })();
}
const cleanup = run(effects[1], true);
for (const visible of [true, false, true, false]) run(effects[0], visible);
cleanup();
assert.deepEqual(sent.map(message => message.visible), [true, false, true, false, true]);
console.log('PASS: macOS playback controls hide/reveal, browsing restoration, old-runtime and other-platform isolation');
