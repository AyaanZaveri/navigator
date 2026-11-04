const assert = require('node:assert/strict');
const { load } = require('./test-support/react-hooks.cjs');
const crypto = require('node:crypto');
const language = load('lib/media/audio-language.ts');
const { MpvController } = load('lib/desktop/mpv-controller.ts', {
 '@/lib/media/audio-language': language,
}, { Event, EventTarget, CustomEvent, DOMException, URL, crypto, setTimeout, clearTimeout });
const sent = [], listeners = new Set();
const controller = new MpvController({ platform: 'windows', send: m => sent.push(m), subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); } });
const receive = m => listeners.forEach(fn => fn(m));
let canPlay = 0, playing = 0;
controller.addEventListener('canplay', () => canPlay++);
controller.addEventListener('playing', () => playing++);
const loadVideo = name => {
 controller.load(`https://example.test/${name}.mkv`);
 return sent.filter(m => m.type === 'load').at(-1).session;
};
const first = loadVideo('modern-family');
receive({ type: 'loaded', session: first });
receive({ type: 'ready', session: first });
assert.equal(canPlay, 1);
const next = loadVideo('knives-out');
assert.equal(controller.readyState, 0);
// Buffering can finish before mpv's replacement video has a ready frame.
receive({ type: 'state', session: next, state: { paused: false, buffering: true } });
receive({ type: 'state', session: next, state: { buffering: false } });
assert.equal(canPlay, 1, 'Buffering completion must not uncover the retained previous video frame');
assert.equal(playing, 0);
receive({ type: 'loaded', session: next });
receive({ type: 'state', session: next, state: { buffering: true } });
receive({ type: 'state', session: next, state: { buffering: false } });
assert.equal(canPlay, 1, 'Metadata availability is not frame readiness');
receive({ type: 'ready', session: first });
assert.equal(canPlay, 1, 'A stale session cannot uncover the new video');
receive({ type: 'ready', session: next });
assert.equal(canPlay, 2);
assert.equal(controller.readyState, 4);
assert.equal(playing, 1);
controller.dispose();
console.log('PASS: replacement streams stay covered through buffering/metadata until their own ready event');
