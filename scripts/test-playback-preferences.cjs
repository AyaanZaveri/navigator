const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { load, hooks } = require('./test-support/react-hooks.cjs');
const storage = new Map();
const localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
const preferences = load('lib/media/playback-preferences.ts', {}, { localStorage });
const audio = load('lib/media/audio-language.ts');
const subtitles = load('lib/media/subtitle-preference.ts', { './audio-language': audio });
const appearance = load('lib/subtitle-appearance.ts');
const plain = value => JSON.parse(JSON.stringify(value));
const defaults = { episodeAutoplay: true, episodePrefetch: true, autoSelectWebStream: false, audioLanguage: 'en', subtitleLanguage: 'en', subtitleMode: 'normal', subtitlesEnabledByDefault: false };
assert.deepEqual(plain(preferences.readPlaybackPreferences()), defaults);
function mount() {
  const host = hooks();
  const context = load('contexts/settings-context.tsx', { react: host.react, 'react/jsx-runtime': host.jsx,
    '@/lib/subtitle-appearance': appearance, '@/lib/media/playback-preferences': preferences }, { localStorage });
  const render = () => host.render(context.SettingsProvider, { children: null });
  render(); host.flush(); render();
  return { get value() { return context.useSettings(); }, render };
}
let settings = mount();
settings.value.updatePlaybackPreferences({ audioLanguage: 'fra', subtitleLanguage: 'bs', subtitleMode: 'forced', subtitlesEnabledByDefault: true });
settings.render(); settings = mount();
assert.deepEqual(plain(settings.value.playbackPreferences), { ...defaults, audioLanguage: 'fr', subtitleLanguage: 'bs', subtitleMode: 'forced', subtitlesEnabledByDefault: true });
settings.value.updatePlaybackPreferences({ episodeAutoplay: false, episodePrefetch: false, autoSelectWebStream: true }); settings.render(); settings = mount();
assert.equal(settings.value.playbackPreferences.episodeAutoplay, false); assert.equal(settings.value.playbackPreferences.episodePrefetch, false);
assert.equal(settings.value.playbackPreferences.autoSelectWebStream, true, 'Automatic web stream selection persists across remounts');
settings.value.updatePlaybackPreferences({ subtitleMode: 'normal' }); settings.render();
assert.equal(settings.value.playbackPreferences.audioLanguage, 'fr', 'Updating one preference preserves the others');
for (const corrupt of ['{broken', 'null', '5', '{"audioLanguage":"garbage","subtitleMode":"bad","subtitlesEnabledByDefault":"true"}']) {
  storage.set(preferences.PLAYBACK_PREFERENCES_KEY, corrupt);
  assert.deepEqual(plain(mount().value.playbackPreferences), defaults);
}
const noStorage = load('lib/media/playback-preferences.ts', {}, { localStorage: { getItem() { throw Error('denied'); }, setItem() { throw Error('denied'); } } });
noStorage.savePlaybackPreferences({ ...defaults, audioLanguage: 'es' });
assert.equal(noStorage.readPlaybackPreferences().audioLanguage, 'es', 'Unavailable storage retains the current session setting');

const tracks = [
  { language: 'en', label: 'English forced', forced: true, src: 'en-forced' },
  { language: 'fr', label: 'French', src: 'fr-normal' },
  { language: 'eng', label: 'English', src: 'en-normal' },
  { language: 'bs', filename: 'Modern.Family.S06E06.bs.forced.srt', src: 'bs-forced' },
];
assert.equal(subtitles.preferredSubtitleTrack(tracks, 'en', 'normal'), tracks[2]);
assert.equal(subtitles.preferredSubtitleTrack(tracks, 'en-US', 'forced'), tracks[0]);
assert.equal(subtitles.preferredSubtitleTrack(tracks, 'bs', 'forced'), tracks[3]);
assert.equal(subtitles.preferredSubtitleTrack(tracks, 'bs', 'normal'), undefined);
assert.equal(subtitles.preferredSubtitleTrack([{ title: 'English', id: 12 }], 'en', 'normal').id, 12, 'Native engines without language tags can match a clear language title');
assert.equal(subtitles.preferredSubtitleTrack(tracks, 'de', 'normal'), undefined, 'Do not enable an unrelated language');
assert.equal(subtitles.isForcedSubtitle({ forced: false, label: 'Forced' }), false, 'Explicit metadata takes precedence');
assert.equal(audio.preferredAudioTrack([{ lang: 'eng' }, { lang: 'fra', title: 'Commentary' }, { lang: 'fr' }], 'fr').lang, 'fr');
assert.equal(audio.preferredAudioTrack([{ lang: 'rus', title: 'French' }], 'fr'), undefined);
assert.equal(audio.streamLanguagePreference({ title: 'French audio, English subtitles' }, 'fr'), 2);
assert.equal(audio.streamLanguagePreference({ title: 'English audio, French subtitles' }, 'fr'), -1);

// Exercise the player's real subtitle request callback, including reverse
// resolution order and Off while a previous subtitle request is still pending.
const source = fs.readFileSync('components/global-media-player.tsx', 'utf8');
const ast = ts.createSourceFile('player.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let selection, defaultsEffect;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'selectSubtitle') selection = node.initializer.arguments[0].getText(ast);
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect' && node.arguments[0]?.getText(ast).includes('const preferences = playbackPreferencesRef.current')) defaultsEffect = node.arguments[0].getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(selection && defaultsEffect);
const compile = (text, globals) => vm.runInNewContext(ts.transpileModule(`(${text})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, globals);
const browserCaption = { kind: "subtitles", mode: "showing" };
let activeTracks = tracks.map(track => ({ ...track, active: false })), data = [], fetching = false;
const pending = [];
const selectionRequest = { current: 0 }, generation = { current: 1 };
const selectSubtitle = compile(selection, {
  nativePlayback: false, videoRef: { current: { textTracks: [browserCaption] } }, subtitleSelectionRequest: selectionRequest, loadGenerationRef: generation,
  setSubtitleData: value => { data = value; }, setCurrentSubtitle() {}, setSubtitleTracks: update => { activeTracks = update(activeTracks); },
  setFetchingSubtitles: value => { fetching = value; }, fetchSubtitleFileContent: src => new Promise((resolve, reject) => pending.push({ src, resolve, reject })),
  parseSubtitleTextContent: text => [text],
});
(async () => {
  const first = selectSubtitle(tracks[2]);
  assert.equal(browserCaption.mode, 'disabled', 'Downloaded captions disable in-stream captions to avoid duplicate text');
  const second = selectSubtitle(tracks[1]);
  pending[1].resolve({ success: true, content: 'French cue' }); await second;
  pending[0].resolve({ success: true, content: 'Old English cue' }); await first;
  assert.deepEqual(plain(data), ['French cue']);
  assert.equal(activeTracks.find(track => track.active).src, 'fr-normal');
  const late = selectSubtitle(tracks[2]);
  await selectSubtitle(null);
  pending[2].resolve({ success: true, content: 'Must stay off' }); await late;
  assert.equal(data.length, 0); assert.equal(fetching, false); assert.ok(activeTracks.every(track => !track.active));
  const obsolete = selectSubtitle(tracks[2]); generation.current++;
  pending[3].resolve({ success: true, content: 'Previous episode' }); await obsolete;
  assert.equal(data.length, 0, 'Previous-episode subtitle results cannot attach to a new video');
  const failure = selectSubtitle(tracks[2]); pending[4].reject(Error('offline')); await failure;
  assert.equal(fetching, false, 'Network failures release the subtitle loader');

  function automatic({ enabled = true, mode = 'normal', manual = false, downloaded = tracks, native = [], browser } = {}) {
    const applied = { current: manual }, chosen = [], listeners = new Map();
    const element = { controller: { tracks: native, selectTrack: (...args) => chosen.push(args) },
      addEventListener: (name, callback) => listeners.set(name, callback), removeEventListener: name => listeners.delete(name) };
    if (browser) element.textTracks = Object.assign(new EventTarget(), { ...browser, length: browser.length });
    const effect = compile(defaultsEffect, {
      playbackPreferencesRef: { current: { ...defaults, subtitlesEnabledByDefault: enabled, subtitleMode: mode } },
      isPlayerVisible: true, streamUrl: 'movie', subtitleOptionsReady: true, videoRef: { current: element },
      subtitleDefaultApplied: applied, subtitleTracks: downloaded, preferredSubtitleTrack: subtitles.preferredSubtitleTrack,
      selectSubtitle: track => { chosen.push(track.src); },
    });
    return { cleanup: effect(), chosen, listeners, element, applied };
  }
  assert.deepEqual(automatic().chosen, ['en-normal']);
  assert.deepEqual(automatic({ mode: 'forced' }).chosen, ['en-forced']);
  assert.deepEqual(automatic({ enabled: false }).chosen, []);
  assert.deepEqual(automatic({ manual: true }).chosen, [], 'Automatic defaults must not override a manual selection');
  const native = automatic({ downloaded: [], native: [{ id: 4, type: 'sub', lang: 'eng' }, { id: 5, type: 'sub', lang: 'eng', title: 'Forced' }] });
  assert.deepEqual(native.chosen, [['subtitle', '4']]);
  native.listeners.get('trackschange')(); assert.equal(native.chosen.length, 1, 'Track updates do not reapply a completed default');
  native.cleanup(); assert.equal(native.listeners.size, 0);
  const browserTracks = [{ kind: 'subtitles', language: 'en', label: 'English forced', mode: 'disabled' },
    { kind: 'captions', language: 'eng', label: 'English', mode: 'disabled' }];
  automatic({ downloaded: [], browser: browserTracks });
  assert.equal(browserTracks[1].mode, 'showing'); assert.equal(browserTracks[0].mode, 'disabled');
  const delayed = automatic({ downloaded: [] });
  delayed.element.controller.tracks = [{ id: 8, type: 'sub', lang: 'eng' }];
  delayed.listeners.get('trackschange')();
  assert.deepEqual(delayed.chosen, [['subtitle', '8']], 'Embedded tracks arriving later still get the preferred default');

  const { resolvePlayback } = load('lib/media/resolve-playback.ts', { '@/lib/media/audio-language': audio });
  for (const environment of ['web', 'native']) {
    const result = await resolvePlayback({ id: 'movie', type: 'movie' }, { environment, preferredAudioLanguage: 'fr',
      fetchStreams: async () => [{ url: 'https://test/english.mp4', title: 'English H264 AAC' }, { url: 'https://test/french.mp4', title: 'French H264 AAC' }] }, () => {});
    assert.equal(result.streamUrl, 'https://test/french.mp4');
  }
  preferences.savePlaybackPreferences({ ...defaults, audioLanguage: 'fr' });
  let receive; const commands = [];
  const { MpvController } = load('lib/desktop/mpv-controller.ts', {
    '@/lib/media/audio-language': audio, '@/lib/media/playback-preferences': preferences,
  }, { EventTarget, Event, CustomEvent, DOMException, URL, crypto: require('node:crypto') });
  const controller = new MpvController({ platform: 'android', subscribe: callback => { receive = callback; return () => {}; }, send: message => commands.push(message) });
  controller.load('https://test/movie.mp4');
  const message = { type: 'tracks', session: controller.previewSession, tracks: [{ id: 10, type: 'audio', lang: 'eng', selected: true }, { id: 11, type: 'audio', lang: 'fra' }] };
  receive(message);
  assert.equal(commands.at(-1).id, '11', 'Native track metadata applies the persisted preferred audio');
  controller.selectTrack('audio', '10'); const count = commands.length;
  receive(message); assert.equal(commands.length, count, 'Native manual audio selection stays in control');

  const browserAudio = new EventTarget();
  const browserAudioTracks = [{ language: 'en', enabled: true }, { language: 'fr', enabled: false }];
  browserAudio.audioTracks = Object.assign(new EventTarget(), { ...browserAudioTracks, length: 2 });
  const stopAudio = audio.installAudioLanguagePreference(browserAudio, 'fr');
  assert.equal(browserAudioTracks[1].enabled, true);
  browserAudioTracks[0].enabled = true; browserAudioTracks[1].enabled = false;
  browserAudio.dispatchEvent(new Event('loadedmetadata'));
  assert.equal(browserAudioTracks[0].enabled, true, 'Browser manual audio survives later metadata events');
  stopAudio();

  console.log('PASS: persisted language/default preferences, corrupt storage recovery, normal/forced matching, web/native audio ranking, delayed native tracks, manual Off and subtitle request races');
})().catch(error => { console.error(error); process.exitCode = 1; });

// Preference menus stay useful when the browser cannot name a language.
// Use the real component with an incomplete display-name provider.
assert.ok(preferences.PLAYBACK_LANGUAGES.length >= 30 && preferences.PLAYBACK_LANGUAGES.length <= 50);
assert.ok(!preferences.PLAYBACK_LANGUAGES.includes('aa'), 'Do not offer the full ISO language catalogue');
assert.equal(preferences.normalizePlaybackPreferences({ subtitleLanguage: 'eo' }).subtitleLanguage, 'eo', 'Preserve a valid preference saved by an earlier version');
const flags = load('lib/media/track-flags.ts');
const ui = hooks();
const { PlaybackLanguageSettings } = load('components/playback-language-settings.tsx', {
  'react/jsx-runtime': ui.jsx,
  '@/contexts/settings-context': { useSettings: () => ({ playbackPreferences: defaults, updatePlaybackPreferences() {} }) },
  '@/lib/media/playback-preferences': preferences,
  '@/lib/media/track-label': { trackLanguage: () => ({ label: 'Unknown language' }) },
  '@/lib/media/track-flags': flags,
  '@/components/arc/dropdown-menu/dropdown-menu': { DropdownMenu: 'Menu', DropdownMenuTrigger: 'Trigger', DropdownMenuContent: 'Content', DropdownMenuGroup: 'Group', DropdownMenuOptions: 'Options' },
  '@/components/arc/select/select': { Select: 'Select' }, '@/components/arc/switch/switch': { Switch: 'Switch' },
  '@/components/ui/button': { Button: 'Button' }, '@/components/ui/badge': { Badge: 'Badge' },
  '@/components/ui/field': { Field: 'Field', FieldGroup: 'FieldGroup', FieldLabel: 'FieldLabel', FieldDescription: 'FieldDescription', FieldContent: 'FieldContent' },
  '@/app/(main)/settings/settings.module.css': {},
});
function find(node, predicate) {
  if (Array.isArray(node)) return node.flatMap(child => find(child, predicate));
  if (!node || typeof node !== 'object') return [];
  return [...(predicate(node) ? [node] : []), ...find(node.props?.children, predicate)];
}
const languageField = find(PlaybackLanguageSettings(), node => node.props?.id === 'preferred-subtitle-language')[0];
const rows = find(languageField.type(languageField.props), node => node.type === 'Select')[0].props.options;
assert.equal(rows[0].label, 'English');
assert.equal(rows.length, preferences.PLAYBACK_LANGUAGES.length);
assert.ok(rows.every(row => row.label && row.label !== 'Unknown language' && row.badge && row.flag));
assert.equal(rows.find(row => row.value === 'bs').label, 'Bosnian');
assert.equal(rows.find(row => row.value === 'pt-BR').label, 'Portuguese (Brazil)');
const legacy = find(languageField.type({ ...languageField.props, value: 'eo' }), node => node.type === 'Select')[0].props.options;
assert.equal(legacy[0].value, 'eo'); assert.notEqual(legacy[0].label, 'Unknown language');
console.log(`PASS: ${rows.length} named common-language choices with flags, incomplete browser dictionary fallback and saved preference compatibility`);
