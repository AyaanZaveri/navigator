const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { load, hooks } = require('./test-support/react-hooks.cjs');

const host = hooks();
const timing = load('lib/media/subtitle-timing.ts', { react: host.react });
const movie = { type: 'movie', id: 'movie-1' };
const episode1 = { type: 'series', id: 'show', seasonNumber: 1, episodeNumber: 1 };
const episode2 = { ...episode1, episodeNumber: 2 };
const render = media => host.render(() => timing.useSubtitleTiming(media));
let state = render(movie);
assert.equal(state.seconds, 0);
state.onChange(1.2); state = render(movie);
assert.equal(state.seconds, 1.2);
state = render(episode1); assert.equal(state.seconds, 0);
state.onChange(-0.8); state = render(episode1); assert.equal(state.seconds, -0.8);
assert.equal(render(episode2).seconds, 0, 'Episodes must have separate offsets');
assert.equal(render({ ...movie, streamUrl: 'replacement-stream' }).seconds, 1.2, 'Changing source must preserve timing for the same video');
state = render(episode1); state.onChange(0); assert.equal(render(episode1).seconds, 0);
assert.equal(render(movie).seconds, 1.2, 'Reset only affects this video');
state = render(null); state.onChange(9); assert.equal(render(null).seconds, 0);
for (const [input, expected] of [[35,30],[-35,-30],[0.26,0.3],[NaN,0],[Infinity,0]]) {
 assert.equal(timing.normalizeSubtitleDelay(input), expected);
}

// Exercise the actual player's cue selection with both signs and an unchanged
// playback time (adjusting the control while paused must update the cue).
const source = fs.readFileSync('components/global-media-player.tsx', 'utf8');
const parsed = ts.createSourceFile('player.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let lookup;
function visit(node) {
 if (ts.isVariableDeclaration(node) && node.name.getText(parsed) === 'findCurrentSubtitle') lookup = node.initializer.arguments[0].getText(parsed);
 ts.forEachChild(node, visit);
}
visit(parsed);
const find = vm.runInNewContext(ts.transpileModule(`(${lookup})`, {
 compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText, {
 subtitleData: [{ timestamp: 10, endTimestamp: 12, text: 'Hello' }],
 processSubtitleText: text => ({ text, positionTop: false }),
});
assert.equal(find(timing.subtitleTime(10,1)), null, 'Positive offset waits longer');
assert.equal(find(timing.subtitleTime(11,1)).text, 'Hello');
assert.equal(find(timing.subtitleTime(9,-1)).text, 'Hello', 'Negative offset shows the cue earlier');
assert.equal(find(timing.subtitleTime(13,0)), null, 'Cue clears after its end');
assert.equal(find(timing.subtitleTime(9,0)), null);
assert.equal(find(timing.subtitleTime(9,-1)).text, 'Hello', 'Paused time can select a new cue after adjustment');
assert.match(source, /\[currentTime, findCurrentSubtitle, subtitleTiming\.seconds\]/);

const { SubtitleTimingDialog } = load('components/subtitle-timing-dialog.tsx', {
 'react/jsx-runtime': host.jsx,
 '@/components/arc/dialog/dialog': { Dialog: 'Dialog', DialogContent: 'DialogContent' },
 '@/components/arc/number-field/number-field': { NumberField: 'NumberField' },
 '@/components/ui/button': { Button: 'Button' },
 '@/components/ui/field': { Field: 'Field', FieldGroup: 'FieldGroup' },
 '@/lib/media/subtitle-timing': timing,
});
function all(tree, type) {
 if (Array.isArray(tree)) return tree.flatMap(child => all(child, type));
 if (!tree || typeof tree !== 'object') return [];
 return [...(tree.type === type ? [tree] : []), ...all(tree.props?.children, type)];
}
let focused = false, prevented = false;
const container = { querySelector: () => ({ focus: () => { focused = true; } }) };
const dialog = SubtitleTimingDialog({ open: true, onOpenChange() {}, seconds: 1, onChange() {}, available: false, container });
assert.equal(all(dialog,'DialogContent')[0].props.container, container, 'Dialog stays inside the fullscreen player');
assert.equal(all(dialog,'NumberField')[0].props.disabled, true, 'Embedded tracks must not offer nonfunctional timing');
assert.match(all(dialog,'NumberField')[0].props.description, /Embedded subtitle timing is not supported/);
all(dialog,'DialogContent')[0].props.onCloseAutoFocus({ preventDefault() { prevented = true; } });
assert.ok(focused && prevented, 'Closing the dialog returns focus to the persistent settings trigger');
console.log('PASS: subtitle timing direction, cue boundaries, limits, reset and per-video isolation');
