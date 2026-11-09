const assert = require('node:assert/strict');
const fs = require('node:fs');
const postcss = require('postcss');
const { load, hooks } = require('./test-support/react-hooks.cjs');
for (const platform of ['windows', 'macos', 'android', undefined]) {
  const h = hooks(), sent = [];
  let listener, unsubscribed = false;
  const bridge = platform && { platform, fullscreen: false, send: message => sent.push(message), subscribe(fn) { listener = fn; return () => { unsubscribed = true; }; } };
  const { DesktopWindowControls } = load('components/desktop/window-controls.tsx', {
    react: h.react, 'react/jsx-runtime': h.jsx,
    'lucide-react': { Minus: 'minus-icon', Maximize: 'fullscreen-icon', X: 'close-icon' },
    '@/lib/desktop/bridge': { desktopBridge: () => bridge },
    './window-controls.module.css': { controls: 'controls', close: 'close' },
  });
  assert.equal(h.render(DesktopWindowControls), null);
  h.flush();
  const tree = h.render(DesktopWindowControls);
  if (platform !== 'windows') { assert.equal(tree, null); continue; }
  const buttons = tree.props.children;
  assert.deepEqual(Array.from(buttons, button => button.props['aria-label']), ['Minimize', 'Enter fullscreen', 'Close window']);
  buttons.forEach(button => button.props.onClick());
  assert.deepEqual(sent.map(message => message.action), ['minimize', 'toggle-maximize', 'close']);
  listener({ type: 'fullscreen', value: true });
  assert.equal(h.render(DesktopWindowControls), null, 'Fullscreen must hide caption buttons');
  listener({ type: 'fullscreen', value: false });
  assert.equal(h.render(DesktopWindowControls).props.children.length, 3);
  h.unmount(); assert.ok(unsubscribed);
}
const css = postcss.parse(fs.readFileSync('components/desktop/window-controls.module.css', 'utf8'));
const buttons = css.nodes.find(node => node.selector === '.controls button');
const value = name => parseFloat(buttons.nodes.find(node => node.prop === name).value);
const native = fs.readFileSync('desktop/src/platform/windows.rs', 'utf8');
assert.equal(value('width'), Number(/CAPTION_BUTTON_WIDTH: f64 = ([\d.]+)/.exec(native)[1]), 'Visible button width must match native hit testing');
assert.equal(value('height'), Number(/CAPTION_HEIGHT: f64 = ([\d.]+)/.exec(native)[1]), 'Visible button height must match native hit testing');
console.log('PASS: Windows caption actions, fullscreen hide/restore, platform isolation, and CSS/native hit-region alignment');
