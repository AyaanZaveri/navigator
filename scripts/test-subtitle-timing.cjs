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


const { SubtitleTimingPopover } = load('components/subtitle-timing-popover.tsx', {
 react: { useId: () => 'timing-test-id', useRef: value => ({ current: value }) },
 'react/jsx-runtime': host.jsx,
 '@/components/arc/popover/popover': { Popover: 'Popover', PopoverAnchor: 'PopoverAnchor', PopoverContent: 'PopoverContent', PopoverClose: 'PopoverClose' },
 '@/components/arc/ruler-slider/ruler-slider': { RulerSlider: 'RulerSlider' },
 '@/components/ui/button': { Button: 'Button' },
 '@/lib/media/subtitle-timing': timing,
 './subtitle-timing-popover.module.css': {},
 './arc/floating-surface.module.css': {},
});
function all(tree, type) {
 if (Array.isArray(tree)) return tree.flatMap(child => all(child, type));
 if (!tree || typeof tree !== 'object') return [];
 return [...(tree.type === type ? [tree] : []), ...all(tree.props?.children, type)];
}
let focused = false, prevented = false, changed;
const menu = {};
const anchor = { closest: () => menu, isConnected: true, contains: () => false, focus: () => { focused = true; } };
const container = { querySelector: () => anchor };
const renderPanel = (seconds, available = true) => SubtitleTimingPopover({
 open: true, onOpenChange() {}, seconds, onChange: value => { changed = value; }, available, container,
});
let panel = renderPanel(1, false);
assert.equal(panel.props.modal, false, 'Timing must not block or dim the video');
assert.equal(all(panel,'PopoverContent')[0].props.container, container, 'Popover stays inside the fullscreen player');
assert.equal(all(panel,'PopoverContent')[0].props.side, 'left', 'Timing opens beside Settings like the other nested panels');
assert.equal(all(panel,'PopoverAnchor')[0].props.virtualRef.current, anchor, 'Anchor survives the settings menu unmount');
assert.equal(all(panel,'RulerSlider')[0].props.disabled, true, 'Embedded tracks must not offer nonfunctional timing');
assert.equal(all(panel,'p')[0].props.className, 'sr-only', 'Keep technical status out of the visible layout');
assert.equal(all(panel,'RulerSlider')[0].props.hideLabel, true, 'Avoid repeating the heading above the ruler');
all(panel,'PopoverContent')[0].props.onCloseAutoFocus({ preventDefault() { prevented = true; } });
assert.ok(focused && prevented, 'Closing returns focus to the persistent settings trigger');
let rulerFocused = false;
all(panel,'PopoverContent')[0].props.onOpenAutoFocus({ currentTarget: { querySelector: () => ({ focus: () => { rulerFocused = true; } }) }, preventDefault() {} });
assert.ok(rulerFocused, 'The ruler receives keyboard focus on open');
panel = renderPanel(.3);
const ruler = all(panel,'RulerSlider')[0];
assert.equal(ruler.props.step, .1);
assert.equal(ruler.props.largeStep, 1);
assert.equal(ruler.props.min, -30);
assert.equal(ruler.props.max, 30);
assert.equal(ruler.props.format(.3), '+0.3');
ruler.props.onValueChange(-.4); assert.equal(changed, -.4, 'Dragging updates the existing timing state immediately');
const panelButtons = tree => [...all(tree,'Button'), ...all(all(tree,'RulerSlider')[0].props.valueStart,'Button'), ...all(all(tree,'RulerSlider')[0].props.valueEnd,'Button')];
let buttons = panelButtons(panel);
buttons.find(node => node.props['aria-label']?.endsWith('earlier')).props.onClick();
assert.equal(changed, .2, 'Earlier nudges one tenth without floating-point drift');
buttons.find(node => node.props['aria-label']?.endsWith('later')).props.onClick();
assert.equal(changed, .4);
buttons.find(node => node.props.children === 'Reset').props.onClick();
assert.equal(changed, 0);
assert.ok(all(panel,'p').some(node => String(node.props.children).includes('0.3 seconds later')));
assert.ok(all(renderPanel(-.3),'p').some(node => String(node.props.children).includes('0.3 seconds earlier')));
for (const [seconds, direction] of [[-30,'earlier'],[30,'later']]) {
 const atLimit = panelButtons(renderPanel(seconds)).find(node => node.props['aria-label']?.endsWith(direction));
 assert.equal(atLimit.props.disabled, true);
}
assert.equal(all(renderPanel(0),'Button').find(node => node.props.children === 'Reset').props.disabled, true);
console.log('PASS: live ruler timing, precise nudges, limits, reset, embedded-track gating, fullscreen anchoring and focus return');

focused = false;
const closedOutside = all(panel,'PopoverContent')[0];
closedOutside.props.onInteractOutside({ target: {}, preventDefault() {} });
closedOutside.props.onCloseAutoFocus({ preventDefault() {} });
assert.equal(focused, false, 'Outside interaction must retain the user\'s new focus target');

// Reproduce the focus handoff Radix causes when the pointer leaves the row.
panel = renderPanel(.3);
const content = all(panel, 'PopoverContent')[0];
prevented = false; focused = false;
content.props.onInteractOutside({ target: menu, detail: { originalEvent: { type: 'focusin' } }, preventDefault() { prevented = true; } });
assert.equal(prevented, true, 'Hover-induced menu focus must not dismiss the timing panel');
content.props.onCloseAutoFocus({ preventDefault() {} });
assert.equal(focused, true, 'An internal hover handoff must preserve focus return');
prevented = false;
content.props.onInteractOutside({ target: menu, detail: { originalEvent: { type: 'pointerdown' } }, preventDefault() { prevented = true; } });
assert.equal(prevented, false, 'Real outside pointer interactions still dismiss the panel');
assert.ok(Object.hasOwn(content.props, 'data-player-native-glass'), 'Timing participates in native menu glass');
console.log('PASS: hover focus handoff stays open without blocking real outside dismissal');
