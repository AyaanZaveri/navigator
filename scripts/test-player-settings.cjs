const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { load, hooks } = require('./test-support/react-hooks.cjs');
const labels = load('lib/media/track-label.ts', {}, { URL });
assert.equal(labels.trackLanguage('eng').label, 'English');
assert.equal(labels.trackLanguage('eng').badge, 'EN');
assert.equal(labels.trackLanguage('pob').label, 'Brazilian Portuguese');
assert.equal(labels.trackLanguage('pob').badge, 'PT-BR');
assert.equal(labels.trackLanguage('tur').label, 'Turkish');
assert.equal(labels.trackLanguage('bad/code').label, 'Unknown language');
const described = labels.describeTrack({ language: 'eng', label: 'eng', src: 'https://example.test/Movie.1080p.srt?token=secret', provider: 'OpenSubtitles' }, 1);
assert.equal(described.description, 'Movie.1080p.srt · OpenSubtitles');
assert.ok(!described.description.includes('secret'));
assert.equal(labels.describeTrack({ language: 'eng', label: 'eng', src: 'https://example.test/download?token=secret' }, 2).description, 'Track 3');
assert.equal(labels.describeTrack({ language: 'eng', label: 'English SDH' }, 0).description, 'English SDH');
assert.equal(labels.describeTrack({ language: 'eng', filename: 'C:\\Subs\\Actual.release.srt' }, 0).description, 'Actual.release.srt');

const source = fs.readFileSync('components/ui/media-player.tsx', 'utf8');
const parsed = ts.createSourceFile('player.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function component(name, context, state, sent) {
  const node = parsed.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  const globals = {
    exports: {}, require,
    React: { ...React, useCallback: fn => fn },
    useMediaPlayerContext: () => context,
    useStoreContext: () => ({ setState: (...args) => sent.push(args) }),
    useMediaDispatch: () => action => sent.push(action),
    useMediaSelector: select => select(state),
    MediaActionTypes: new Proxy({}, { get: (_, key) => key }),
    SETTINGS_NAME: 'Settings', PLAYBACK_SPEED_NAME: 'Speed', FLOATING_MENU_SIDE_OFFSET: 10,
    SPEEDS: [0.5, 1, 1.5, 2], trackOptions: labels.trackOptions,
    cn: (...values) => values.filter(Boolean).join(' '),
    playerSettingsStyles: { speedTrigger: 'speed' },
    Select: 'Select', PlayerSettingsPanel: 'PlayerSettingsPanel', Popover: 'Popover',
    PopoverContent: 'PopoverContent', PopoverTrigger: 'PopoverTrigger',
    MediaPlayerTooltip: 'Tooltip', SettingsIcon: 'svg', Button: 'Button',
  };
  vm.runInNewContext(ts.transpileModule(`export ${node.getText(parsed)}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, globals);
  return globals.exports[name]({});
}
function find(node, type) {
  if (!node || typeof node !== 'object') return [];
  return [...(node.type === type ? [node] : []), ...[].concat(node.props?.children ?? []).flatMap(child => find(child, type))];
}
const tracks = [
  { src: '/tur.srt', label: 'tur', language: 'tur', kind: 'subtitles', active: false },
  { src: '/english-first.srt', label: 'eng', language: 'eng', kind: 'subtitles', active: false },
  { src: '/english-second.srt', label: 'eng', language: 'eng', kind: 'subtitles', active: true },
];
const selected = [], sent = [], root = {};
const context = { rootRef: { current: root }, customSubtitlesEnabled: true, customSubtitleTracks: tracks, onCustomSubtitleChange: track => selected.push(track), isVideo: true };
const state = { mediaPlaybackRate: 1, mediaRenditionList: [{ id: '720', height: 720 }, { id: '1080', height: 1080 }] };
const tree = component('MediaPlayerSettings', context, state, sent);
assert.equal(tree.type, 'Popover', 'Settings use a form panel instead of nested selection submenus');
tree.props.onOpenChange(true);
assert.equal(sent[0][0], 'menuOpen');
assert.equal(sent[0][1], true);
const content = find(tree, 'PopoverContent')[0];
assert.equal(content.props.container, root, 'Settings inherit player theme and remain visible in fullscreen');
assert.match(content.props.className, /w-96/);
const panel = find(tree, 'PlayerSettingsPanel')[0];
assert.equal(panel.props.subtitles.value, '2');
assert.equal(panel.props.subtitles.options[1].label, 'English', 'English options are first without changing track indices');
panel.props.subtitles.onChange('2');
assert.equal(selected[0], tracks[2], 'Same-label English options must select the original distinct track');
panel.props.subtitles.onChange('off');
assert.equal(selected[1], null);
panel.props.onSpeedChange(1.5);
assert.equal(sent.at(-1).detail, 1.5);
assert.equal(panel.props.quality.options[1].value, '1080');
panel.props.quality.onChange('auto');
assert.equal(sent.at(-1).detail, undefined);
assert.ok(!JSON.stringify(panel.props).includes('Bitrate'));

const native = { kind: 'captions', language: 'en', label: 'English SDH' };
const nativeTree = component('MediaPlayerSettings', { ...context, customSubtitlesEnabled: false }, {
  mediaSubtitlesList: [native], mediaSubtitlesShowing: [native],
}, sent);
const nativePanel = find(nativeTree, 'PlayerSettingsPanel')[0];
assert.equal(nativePanel.props.subtitles.value, '0');
nativePanel.props.subtitles.onChange('0');
assert.equal(sent.at(-1).detail, native);
nativePanel.props.subtitles.onChange('off');
assert.equal(sent.at(-1).detail, false);
assert.equal(nativePanel.props.quality, undefined, 'A direct stream has no fabricated quality options');
assert.equal(component('MediaPlayerPlaybackSpeed', context, {}, sent).type, 'Select');
let keyboardHandler;
function findKeyboard(node) {
  if (!keyboardHandler && ts.isVariableDeclaration(node) && node.name.getText(parsed) === 'onKeyDown') keyboardHandler = node.initializer.arguments[0].getText(parsed);
  ts.forEachChild(node, findKeyboard);
}
findKeyboard(parsed);
class SelectElement { closest(selector) { assert.ok(selector.includes('[role="listbox"]')); return this; } }
const keyboard = { exports: {}, disabled: false, rootImplProps: {}, Element: SelectElement,
  mediaRef: { get current() { throw Error('Select typeahead must not reach playback shortcuts'); } } };
vm.runInNewContext(ts.transpileModule(`exports.handle = ${keyboardHandler};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, keyboard);
keyboard.exports.handle({ target: new SelectElement(), key: 'f', defaultPrevented: false });
const activity = load('lib/media/control-activity.ts', {}, {
  Element: SelectElement, document: { activeElement: null, querySelector: selector => selector.includes('[role="listbox"]') ? {} : null },
});
assert.equal(activity.playerControlsActive({ querySelector: () => null }), true, 'An open native track list holds player controls visible');

const { PlayerSettingsPanel } = load('components/player-settings-panel.tsx', {
  'react/jsx-runtime': require('react/jsx-runtime'), '@/components/arc/select/select': { Select: 'UIRCSelect' },
  './player-settings-panel.module.css': {},
});
assert.deepEqual(find(PlayerSettingsPanel(panel.props), 'UIRCSelect').map(node => node.props.label), ['Speed', 'Quality', 'Subtitles']);

// The shared select must keep rich details separate from the typeahead label.
const h = hooks();
const primitive = new Proxy({}, { get: (_, key) => key === '__esModule' ? true : `Select${key}` });
const { Select } = load('components/arc/select/select.tsx', {
  react: { ...React, ...h.react, useId: () => 'subtitle' }, 'react/jsx-runtime': h.jsx,
  '@radix-ui/react-select': primitive,
  'motion/react': { AnimatePresence: 'Presence', motion: { span: 'MotionSpan' }, useReducedMotion: () => true },
  '@/components/ui/badge': { Badge: 'Badge' },
  '../lib/motion-tokens': load('components/arc/motion-tokens.ts'),
  './select.module.css': new Proxy({}, { get: (_, key) => key === '__esModule' ? false : key }),
});
const select = h.render(Select.render, { label: 'Subtitles', value: '2', portalContainer: root, options: panel.props.subtitles.options });
assert.equal(find(select, 'SelectPortal')[0].props.container, root);
assert.equal(find(select, 'SelectItem')[1].props.textValue, 'English');
assert.ok(find(select, 'SelectItem')[1].props['aria-describedby']);
assert.ok(find(select, 'Badge').some(node => node.props.children === 'EN'));

// Native audio/subtitle controls preserve decoder IDs after language sorting.
const nativeHooks = hooks(), nativeCalls = [], events = new Map();
const controller = { tracks: [
  { id: 40, type: 'audio', lang: 'rus' }, { id: 75, type: 'audio', lang: 'eng', selected: true },
  { id: 91, type: 'sub', lang: 'eng', title: 'English SDH' },
], selectTrack: (...args) => nativeCalls.push(args) };
const mediaRef = { current: { controller, closest: () => root,
  addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name) } };
const { DesktopTracks } = load('components/desktop/tracks.tsx', {
  react: { ...React, ...nativeHooks.react }, 'react/jsx-runtime': nativeHooks.jsx,
  '@/components/arc/select/select': { Select: 'UIRCSelect' }, '@/lib/media/track-label': labels,
  '@/components/player-settings-panel.module.css': {},
});
let cleared = 0;
const nativeProps = { mediaRef, sourceKey: 'fixture', onNativeSubtitle() { cleared++; } };
nativeHooks.render(DesktopTracks, nativeProps); nativeHooks.flush();
const nativeControls = find(nativeHooks.render(DesktopTracks, nativeProps), 'UIRCSelect');
assert.equal(nativeControls[0].props.options[0].value, '75');
nativeControls[0].props.onValueChange('75');
nativeControls[1].props.onValueChange('91');
nativeControls[1].props.onValueChange('no');
assert.deepEqual(nativeCalls, [['audio', '75'], ['subtitle', '91'], ['subtitle', 'no']]);
assert.equal(cleared, 2);
nativeHooks.unmount(); assert.equal(events.size, 0);

// Execute the real external-track handler: duplicate raw labels used to load
// the first English file regardless of which menu option was chosen.
(async () => {
  const global = ts.createSourceFile('global.tsx', fs.readFileSync('components/global-media-player.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let handler;
  function walk(node) {
    if (ts.isJsxAttribute(node) && node.name.getText(global) === 'onCustomSubtitleChange') handler = node.initializer.expression.getText(global);
    ts.forEachChild(node, walk);
  }
  walk(global);
  let nextTracks, fetched;
  const env = { exports: {}, subtitleTracks: tracks, nativePlayback: false,
    setFetchingSubtitles() {}, setSubtitleData() {}, setCurrentSubtitle() {},
    fetchSubtitleFileContent: async src => { fetched = src; return { success: true, content: 'subtitle' }; },
    parseSubtitleTextContent: () => [], setSubtitleTracks: update => { nextTracks = update(tracks); },
  };
  vm.runInNewContext(ts.transpileModule(`exports.handler = ${handler};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, env);
  env.exports.handler(tracks[2]);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(fetched, '/english-second.srt');
  assert.equal(nextTracks[2].active, true);
  assert.equal(nextTracks[1].active, false);
  const utils = load('app/actions/utils.ts', {
    '@/lib/subtitle-provider': load('lib/subtitle-provider.ts'),
    './auth': { getInstalledAddons: async () => [{ transportUrl: 'https://addon.test/manifest.json', manifest: { id: 'fixture', name: 'Subtitle provider', resources: ['subtitles'] } }] },
  }, { AbortSignal, fetch: async () => ({ ok: true, json: async () => ({ subtitles: [{ id: 'track', lang: 'eng', filename: 'Actual.release.srt', url: 'https://files.test/123' }] }) }) });
  const discovered = await utils.getSubtitleTracks('tt123', 'movie');
  assert.equal(discovered[0].filename, 'Actual.release.srt');
  assert.equal(discovered[0].provider, 'Subtitle provider');
  console.log('PASS: language names/codes, safe filenames, original track indices, distinct English files, Off, speed/quality actions, player portals and UIRC speed selection.');
})().catch(error => { console.error(error); process.exitCode = 1; });
