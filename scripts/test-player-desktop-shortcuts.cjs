const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { hooks } = require('./test-support/react-hooks.cjs');
const source = process.argv.includes('--baseline')
  ? require('node:child_process').execFileSync('git', ['show', 'HEAD:components/ui/media-player.tsx'], { encoding: 'utf8' })
  : fs.readFileSync('components/ui/media-player.tsx', 'utf8');
const parsed = ts.createSourceFile('player.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const implementation = parsed.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'MediaPlayerRootImpl');

function mount({ native = true, autoFocus = true } = {}) {
  const host = hooks(), listeners = new Map(), sent = [], timers = new Map();
  let timerId = 0;
  class Element {
    constructor(kind = '') { this.kind = kind; }
    closest(selector) { return this.kind && selector.includes(this.kind) ? this : null; }
  }
  const document = {
    activeElement: null, body: new Element(), focused: true, overlay: false,
    hasFocus() { return this.focused; },
    querySelector() { return this.overlay ? new Element() : null; },
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
  };
  const root = new Element('[data-slot="media-player"]');
  root.focus = () => { document.activeElement = root; };
  root.contains = target => target === root;
  class Video {
    constructor() { Object.assign(this, { currentTime: 30, duration: 100, volume: .5, paused: false, muted: false }); }
    addEventListener() {}
    removeEventListener() {}
  }
  const media = new Video();
  const state = { controlsVisible: true, dragging: false, seekMode: null, menuOpen: false, seekPreviewTime: null };
  const store = { setState(key, value) { state[key] = value; }, getState: () => state };
  const actions = Object.fromEntries(['SEEK', 'VOLUME', 'MUTE', 'UNMUTE', 'PLAY', 'PAUSE'].map(key => [`MEDIA_${key}_REQUEST`, key]));
  const context = { exports: {}, document, Element, Node: Element, HTMLVideoElement: Video,
    React: { ...host.react, useLayoutEffect: host.react.useEffect, useId: () => 'id' },
    jsx: host.jsx.jsx, jsxs: host.jsx.jsxs, useMediaFullscreenRef: () => null,
    useComposedRefs: (...refs) => node => refs.forEach(ref => { if (ref && typeof ref === 'object') ref.current = node; }),
    useDirection: () => 'ltr', useMediaDispatch: () => action => sent.push(action),
    useStoreContext: () => store, useStoreSelector: selector => selector(state),
    useMediaSelector: selector => selector({ mediaPaused: false }), desktopBridge: () => native ? { platform: 'windows' } : null,
    setMacOSWindowControlsVisible() {}, playerControlsActive: () => false,
    MediaPlayerContext: { Provider: 'Provider' }, MediaPlayerVolumeIndicator: 'Volume',
    ROOT_NAME: 'MediaPlayer', FLOATING_MENU_SIDE_OFFSET: 10, cn: () => '', SEEK_STEP_SHORT: 5, MediaActionTypes: actions,
    setTimeout(fn) { timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); },
  };
  vm.runInNewContext(ts.transpileModule(`${implementation.getText(parsed)}\nexports.Root = MediaPlayerRootImpl;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, jsxImportSource: 'test' },
  }).outputText.replace(/require\("test\/jsx-runtime"\)/g, '({ jsx, jsxs })'), context);
  const tree = host.render(context.exports.Root, { autoFocus, autoHide: true });
  tree.props.children.props.ref(root);
  tree.props.value.mediaRef.current = media;
  host.flush();
  document.activeElement = document.body;
  state.controlsVisible = false;
  function key(key, target = document.body, extra = {}) {
    const event = { key, target, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra };
    if (target === root) tree.props.children.props.onKeyDown(event);
    for (const listener of listeners.get('keydown') ?? []) listener(event);
    return event;
  }
  return { key, sent, state, root, Element, document, listeners, unmount: host.unmount };
}
const p = mount();
p.key('ArrowRight');
assert.equal(p.sent.at(-1)?.detail, 35, 'Desktop seeks without a prior click on the player');
assert.equal(p.state.controlsVisible, true, 'Seeking may reveal transport controls');
p.state.controlsVisible = false;
p.key('ArrowUp');
assert.equal(p.state.controlsVisible, false, 'Volume does not reveal hidden transport controls');
assert.equal(p.state.volumeIndicatorVisible, true, 'Volume still gives compact visual feedback');
p.key('m');
assert.equal(p.state.controlsVisible, false, 'Mute does not reveal transport controls');
for (const kind of ['textarea', 'input', 'select', '[contenteditable]', '[role="textbox"]', '[role="menu"]', '[role="dialog"]', '[role="slider"]', 'button', 'a[href]']) {
  const before = p.sent.length;
  p.key('ArrowRight', new p.Element(kind));
  assert.equal(p.sent.length, before, `Preserve keyboard interaction for ${kind}`);
}
for (const extra of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { isComposing: true }, { keyCode: 229 }]) {
  const before = p.sent.length; p.key('k', undefined, extra); assert.equal(p.sent.length, before);
}
p.document.overlay = true;
let before = p.sent.length; p.key('k'); assert.equal(p.sent.length, before, 'Open Navigator/dialog keeps keyboard ownership even if focus is on body');
p.document.overlay = false;
p.document.focused = false;
p.key('k'); assert.equal(p.sent.length, before, 'Do not handle background-app shortcuts');
p.document.focused = true;
p.key('k', p.root);
assert.equal(p.sent.length, before + 1, 'Player-bubbled keys execute once, not twice');
p.state.controlsVisible = false;
p.key('AudioVolumeUp');
assert.equal(p.state.controlsVisible, false, 'OS volume keys do not reveal transport controls');
assert.equal(p.sent.length, before + 1, 'Do not also change playback volume for OS hardware volume keys');
p.unmount();
assert.equal(p.listeners.get('keydown')?.size, 0, 'Remove global shortcut listener when player closes');
for (const options of [{ native: false }, { autoFocus: false }]) {
  const embedded = mount(options); embedded.key('ArrowRight');
  assert.equal(embedded.sent.length, 0, 'Web/embedded players do not take app-wide desktop shortcuts');
  embedded.unmount();
}
console.log('PASS: desktop app-focused shortcuts, interactive UI exclusions, quiet volume feedback, exactly-once handling and cleanup.');
