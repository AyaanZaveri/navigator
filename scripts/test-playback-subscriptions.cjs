const assert = require('node:assert/strict');
const jotai = require('jotai');
const { load } = require('./test-support/react-hooks.cjs');
const atoms = load('lib/atoms.ts', { jotai, '@/lib/media/playback-context': require('./test-support/playback-context.cjs'), '@/lib/artwork': { artworkUrl: () => '/backdrop' } }, { setTimeout: () => 0 });
const store = jotai.createStore();
const subscriptions = [], updates = [];
const hooks = load('contexts/MediaPlayerContext.tsx', {
  jotai: {
    useSetAtom: atom => value => store.set(atom, value),
    useAtomValue: atom => { subscriptions.push(atom); store.sub(atom, () => updates.push(atom)); return store.get(atom); },
  }, '@/lib/atoms': atoms,
});
const actions = hooks.usePlaybackActions();
assert.equal(subscriptions.length, 0, 'Play buttons subscribe to no state');
actions.playMedia({ id: 'tt1', type: 'movie', name: 'Movie' });
assert.equal(store.get(atoms.isPlayerVisibleAtom), true);
assert.equal(store.get(atoms.currentMediaAtom).id, 'tt1');
hooks.useIsPlayerVisible();
assert.deepEqual(subscriptions, [atoms.isPlayerVisibleAtom]);
subscriptions.length = 0;
hooks.useMediaPlayer();
assert.equal(subscriptions.includes(atoms.currentTimestampAtom), false, 'Ordinary media state cannot subscribe to the clock');
for (let time = 0.25; time < 10; time += 0.25) actions.setCurrentTimestamp(time);
assert.equal(updates.length, 0, 'Native playback ticks cannot notify any browsing/media-state subscription');
assert.equal(store.get(atoms.currentTimestampAtom), 9.75, 'Snapshots still read the latest playback position');
hooks.usePlaybackTimestamp();
actions.setCurrentTimestamp(10);
assert.deepEqual(updates, [atoms.currentTimestampAtom], 'Only explicit clock consumers receive time ticks');
actions.skipToTimestamp(42);
assert.equal(store.get(atoms.skipTimestampAtom), 42);
console.log('PASS: command-only hooks have zero subscriptions, browsing state ignores playback ticks, clock reads are opt-in, and playback/seek commands remain functional.');
