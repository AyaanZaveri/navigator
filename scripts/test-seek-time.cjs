// Exercise the real clock component with the same transient time the slider uses.
// No DOM, WebView, browser or server is started.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const source = ts.createSourceFile('player.tsx', fs.readFileSync('components/ui/media-player.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const component = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'MediaPlayerTime');
const code = ts.transpileModule(component.getText(source) + '\nexport { MediaPlayerTime };', {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const state = { seekPreviewTime: null };
const media = { mediaCurrentTime: 10, mediaSeekable: [0, 120] };
const context = { exports: {}, require, React: { useMemo: fn => fn() },
  useMediaPlayerContext: () => ({ dir: 'ltr' }),
  useMediaSelector: selector => selector(media), useStoreSelector: selector => selector(state),
  timeUtils: { formatTime: seconds => String(seconds) }, cn: (...parts) => parts.filter(Boolean).join(' '),
};
vm.runInNewContext(code, context);
function text(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return React.Children.toArray(node?.props?.children).map(text).join('');
}
const clock = variant => text(context.exports.MediaPlayerTime({ variant }));
assert.equal(clock('progress'), '10/120');
for (const target of [10.5, 30, 31, 29, 119]) {
  state.seekPreviewTime = target;
  assert.equal(clock('progress'), `${target}/120`, 'Clock follows the seek target immediately, independent of committed playback or physical finger position');
  assert.equal(clock('remaining'), String(120 - target));
  assert.equal(clock('duration'), '120');
}
state.seekPreviewTime = null;
assert.equal(clock('progress'), '10/120', 'Cancelling restores actual playback time');
media.mediaCurrentTime = 60;
assert.equal(clock('progress'), '60/120', 'Normal playback resumes using its live clock');
console.log('PASS: shared seek clock follows fine/fast targets and reversals, preserves duration, and restores on cancellation');
