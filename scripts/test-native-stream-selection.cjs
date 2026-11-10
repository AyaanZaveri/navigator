const assert = require('node:assert/strict');
const { load } = require('./test-support/react-hooks.cjs');
const { resolvePlayback } = load('lib/media/resolve-playback.ts', {}, { AbortController, DOMException, setTimeout, clearTimeout });
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function source() {
 let resolve, reject; const listeners = new Set();
 const value = { id: 'movie', type: 'movie', canonicalId: Promise.resolve('movie'),
  promise: new Promise((yes, no) => { resolve = yes; reject = no; }),
  snapshot: { streams: [], complete: false, pending: 3, total: 3, settledPrefix: 0 },
  subscribe(fn) { listeners.add(fn); fn(value.snapshot); return () => listeners.delete(fn); },
  publish(streams, settledPrefix, complete = false) {
   value.snapshot = { streams, settledPrefix, complete, pending: complete ? 0 : 1, total: 3 };
   for (const fn of listeners) fn(value.snapshot);
   if (complete) resolve(streams);
  }, reject, listeners };
 return value;
}
const stream = (id, addonIndex, title = 'English') => ({ url: `https://fixture.test/${id}.mkv`, addonIndex, addonId: String(addonIndex), addonName: String(addonIndex), title });
const request = { id: 'movie', type: 'movie', name: 'Movie' };
const deps = { environment: 'native', preferredAudioLanguage: 'en', fetchStreams: () => assert.fail('Use shared discovery'), getNextEpisodeForSeries: async () => null, inspectStream: () => assert.fail('Native must not add a web probe'), verifyStream: () => assert.fail('Native must not add a web probe') };
async function main() {
 const first = source(); let result;
 const early = resolvePlayback(request, { ...deps, createStreamRequest: () => first }, () => {}).then(value => { result = value; return value; });
 first.publish([stream('fast', 0)], 1); await flush();
 assert.equal(result?.streamUrl, 'https://fixture.test/fast.mkv', 'A maximum-language-rank result from a settled prefix must start without waiting for lower-priority add-ons');
 assert.equal(result.streamRequest, first); assert.equal(first.listeners.size, 0);
 first.publish([stream('fast', 0), stream('late', 2)], 3, true); await early;
 for (const title of ['English', 'Multi English German', '1080p H264']) {
  const pending = source(); let selected;
  const playback = resolvePlayback({ ...request, streamRequest: pending }, deps, () => {}).then(value => { selected = value; return value; });
  pending.publish([stream('later', 1, title)], 0); await flush();
  assert.equal(selected, undefined, 'A pending earlier add-on can still change the winner');
  pending.publish([stream('earlier', 0), stream('later', 1, title)], 2); await flush();
  assert.equal(selected?.streamUrl, 'https://fixture.test/earlier.mkv');
  await playback;
 }
 for (const title of ['Multi English German', '1080p H264', 'German']) {
  const pending = source(); let selected;
  const playback = resolvePlayback({ ...request, streamRequest: pending }, deps, () => {}).then(value => { selected = value; return value; });
  pending.publish([stream('unknown', 0, title)], 1); await flush(); assert.equal(selected, undefined, 'Unknown/mixed/other language must not outrun a later preferred language');
  pending.publish([stream('unknown', 0, title), stream('preferred', 1)], 3, true);
  assert.equal((await playback).streamUrl, 'https://fixture.test/preferred.mkv');
 }
 const cancelled = source(), abort = new AbortController();
 const cancellation = resolvePlayback({ ...request, streamRequest: cancelled }, { ...deps, signal: abort.signal }, () => {});
 const rejected = assert.rejects(cancellation, /cancelled/); abort.abort(new Error('cancelled')); await rejected;
 assert.equal(cancelled.listeners.size, 0);
 cancelled.publish([stream('late', 0)], 3, true);
 const failed = source(); const failure = resolvePlayback({ ...request, streamRequest: failed }, deps, () => {});
 const failureCheck = assert.rejects(failure, /provider failed/); failed.reject(new Error('provider failed')); await failureCheck;
 const empty = source(); const noStreams = resolvePlayback({ ...request, streamRequest: empty }, deps, () => {});
 const emptyCheck = assert.rejects(noStreams, /No playable streams/); empty.publish([], 3, true); await emptyCheck;
 const manual = await resolvePlayback({ ...request, streamUrl: 'https://fixture.test/manual.mkv' }, { ...deps, createStreamRequest: () => assert.fail('Manual selection must not start discovery') }, () => {});
 assert.equal(manual.streamUrl, 'https://fixture.test/manual.mkv');
 // Every completion order and language-tier combination must keep the final winner.
 const titles = ['German', '1080p H264', 'Multi English German', 'English'];
 const orders = [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
 for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) for (let c = 0; c < 4; c++) {
  const tiers = [a,b,c];
  const candidates = tiers.map((tier,index) => stream(String(index), index, titles[tier]));
  const expected = tiers.indexOf(Math.max(...tiers));
  for (const order of orders) {
   const provider = source(), settled = [false,false,false];
   const playback = resolvePlayback({ ...request, streamRequest: provider }, deps, () => {});
   for (const index of order) {
    settled[index] = true;
    let prefix = 0; while (settled[prefix]) prefix++;
    provider.publish(candidates.filter((_, i) => settled[i]), prefix, settled.every(Boolean));
    await flush();
   }
   assert.equal((await playback).streamUrl, candidates[expected].url, 'Early selection must equal full discovery across 384 order/tier cases');
   assert.equal(provider.listeners.size, 0);
  }
 }
 const alreadyCancelled = source();
 const aborted = resolvePlayback({ ...request, streamRequest: alreadyCancelled }, { ...deps, signal: AbortSignal.abort(new Error('already cancelled')) }, () => {});
 await assert.rejects(aborted, /already cancelled/);
 alreadyCancelled.reject(new Error('late discovery error')); await flush();
 const duplicates = source();
 const deduped = resolvePlayback({ ...request, streamRequest: duplicates }, deps, () => {});
 duplicates.publish([stream('same', 0, 'German'), stream('same', 1), stream('different', 2)], 3, true);
 assert.equal((await deduped).streamUrl, 'https://fixture.test/different.mkv', 'Duplicate URLs retain earlier-provider metadata before language ranking');
 console.log('PASS: progressive native selection preserves language/add-on order, keeps late results, avoids probes, and handles cancellation/errors/manual URLs');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
