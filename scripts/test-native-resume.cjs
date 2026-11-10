const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { load } = require('./test-support/react-hooks.cjs');
const { MpvController } = load('lib/desktop/mpv-controller.ts', {
 '@/lib/media/playback-preferences': { readPlaybackPreferences: () => ({ audioLanguage: 'en' }) },
}, { Event, EventTarget, CustomEvent, DOMException, URL, crypto, setTimeout, clearTimeout });
for (const platform of ['macos', 'windows', 'linux', 'android', 'ios']) {
 const sent = [];
 const controller = new MpvController({ platform, capabilities: { initialSeek: true }, send: m => sent.push(m), subscribe: () => () => {} });
 for (const [requested, expected] of [[123.4, 123.4], [0, 0], [-2, 0], [NaN, 0], [Infinity, 0]]) {
  controller.load('https://fixture.test/episode.mkv', undefined, requested);
  const request = sent.filter(m => m.type === 'load').at(-1);
  assert.equal(request.startPosition, expected, `${platform}: resume belongs to the load before the first frame`);
  assert.equal(sent.filter(m => m.session === request.session && m.type === 'seek').length, 0);
 }
 controller.dispose();
}
for (const platform of ['macos', 'windows', 'linux']) {
 const sent = [];
 const controller = new MpvController({ platform, send: m => sent.push(m), subscribe: () => () => {} });
 controller.load('https://fixture.test/episode.mkv', undefined, 123.4);
 assert.equal('startPosition' in sent.find(m => m.type === 'load'), false, 'Older runtimes reject unknown load fields; retain metadata-time resume');
 controller.dispose();
}
console.log('PASS: initial native resume, zero/reset, finite-value sanitization, and older-runtime compatibility');
