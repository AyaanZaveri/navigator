const assert = require('node:assert/strict');
const { applyPlaybackContext, details } = require('./test-support/playback-context.cjs');
const { load } = require('./test-support/react-hooks.cjs');
const artwork = load('lib/artwork.ts', {}, { URLSearchParams });
const resolve = load('lib/media/resolve-playback.ts', { '@/lib/media/audio-language': load('lib/media/audio-language.ts') });
(async () => {
  const show = { id: 'tt1442437', type: 'series', name: 'Modern Family', logo: '/already-loaded.svg', year: 2009, imdbRating: '8.5', runtime: '21 min',
    videos: [{ id: 'tt1442437:6:4', season: 6, episode: 4, title: "Won’t You Be Our Neighbor" }, { id: 'tt1442437:1:1', season: 1, episode: 1, title: 'Pilot' }] };
  const candidates = [{ url: 'https://example.test/video.mp4', title: 'English AVC AAC' }];
  const streamRequest = { id: 'tt1442437:6:4', type: 'series', canonicalId: Promise.resolve('tt1442437:6:4'), promise: Promise.resolve(candidates) };
  const page = { media: show, streamRequests: new Map([['series:tt1442437:6:4', streamRequest]]) };
  const request = { id: show.id, type: 'series', name: 'Episode 4', mediaSourceId: 'tt1442437:6:4', seasonNumber: 6, episodeNumber: 4, streamRequest };
  const ready = applyPlaybackContext(request, page);
  assert.equal(ready.episodeTitle, "Won’t You Be Our Neighbor", 'Page episode names are available before the player mounts');
  assert.equal(ready.details.logo, show.logo);
  assert.equal(ready.detailsLoaded, true);
  assert.equal(ready.details.videos.length, 1, 'Playback carries only the target episode, never every season');
  assert.equal(ready.streamRequest, streamRequest);
  const initial = details.initialPlaybackDetails(ready);
  assert.equal(initial.logo, show.logo);
  assert.equal(initial.imdbRating, '8.5');
  assert.equal(applyPlaybackContext({ id: 'other', type: 'movie', name: 'Other' }, page).details, undefined, 'Unrelated cards and Navigator requests cannot inherit page metadata');
  assert.equal(applyPlaybackContext({ id: show.id, type: 'series', name: show.name }, page).episodeTitle, 'Pilot', 'Known episode lists avoid a redundant first-episode lookup');
  let fetches = 0;
  const played = await resolve.resolvePlayback(ready, { fetchStreams: async () => { fetches++; return []; }, getNextEpisodeForSeries: async () => { throw Error('Episode is already known'); } }, () => {});
  assert.equal(fetches, 0, 'Explicit shared requests are preserved while page metadata is applied');
  const tmdbPage = { media: { ...show, id: 'tmdb:1421', imdbId: show.id }, streamRequests: new Map([
    ['series:tmdb:1421:6:4', { ...streamRequest, id: 'tmdb:1421:6:4' }],
  ]) };
  const aliased = applyPlaybackContext(request, tmdbPage);
  assert.equal(aliased.details.logo, show.logo, 'Verified TMDB/IMDb aliases share the viewed page metadata');
  assert.equal(aliased.streamRequest.promise, streamRequest.promise, 'Navigator IMDb IDs can join the viewed TMDB page stream read');
  await resolve.resolvePlayback(aliased, { fetchStreams: async () => { throw Error('No duplicate aliased request'); }, getNextEpisodeForSeries: async () => null }, () => {});

  assert.equal(played.streamUrl, candidates[0].url);
  const otherEpisode = { ...ready, mediaSourceId: 'tt1442437:6:5', episodeNumber: 5 };
  await resolve.resolvePlayback(otherEpisode, { fetchStreams: async () => { fetches++; return candidates; }, getNextEpisodeForSeries: async () => null }, () => {});
  assert.equal(fetches, 1, 'Streams from another episode are never reused');
  const atoms = load('lib/atoms.ts', { jotai: require('jotai'), '@/lib/artwork': artwork, '@/lib/media/playback-context': { applyPlaybackContext }, '@/lib/desktop/bridge': { recordDesktopStage() {} } });
  const store = require('jotai').createStore();
  store.set(atoms.playbackPageContextAtom, page);
  store.set(atoms.playMediaAtom, { ...request, navigatorActionId: 'ask' });
  assert.equal(store.get(atoms.currentMediaAtom).streamRequest, streamRequest, 'Global Ask Navigator commands get the same page context as page buttons');
  assert.equal(store.get(atoms.currentMediaAtom).episodeTitle, ready.episodeTitle);
  let cleanup;
  const { PlaybackPageProvider } = load('components/playback-page-provider.tsx', {
    react: { ...require('react'), useMemo: factory => factory(), useCallback: callback => callback, useSyncExternalStore: (_subscribe, snapshot) => snapshot(), useLayoutEffect: effect => { cleanup = effect(); } },
    jotai: { useSetAtom: atom => update => store.set(atom, update) }, '@/lib/atoms': atoms,
  });
  PlaybackPageProvider({ media: show, children: null });
  assert.equal(store.get(atoms.playbackPageContextAtom).media, show);
  cleanup();
  assert.equal(store.get(atoms.playbackPageContextAtom), null, 'Unmount drops page context rather than persisting results');
  PlaybackPageProvider({ media: show, children: null });
  store.set(atoms.playbackPageContextAtom, tmdbPage);
  cleanup();
  assert.equal(store.get(atoms.playbackPageContextAtom), tmdbPage, 'Late cleanup from an old page cannot erase its replacement');


  const calls = [], progress = [];
  let finish;
  const loader = load('lib/media/fetch-playback-streams.ts', { './fetch-playback-id': { fetchPlaybackId: async id => { assert.equal(id, 'tmdb:1421'); return 'tt1442437'; } } }, {
    URLSearchParams, AbortSignal, fetch: async url => {
      calls.push(url);
      if (url.startsWith('/api/streams/addons?')) return Response.json({ addons: [{ id: 'first', name: 'First' }, { id: 'second', name: 'Second' }] });
      if (url.includes('addonId=first')) return new Promise(resolve => { finish = () => resolve(Response.json({ streams: candidates })); });
      return Response.json({ streams: [{ url: 'https://example.test/second.mp4' }] });
    },
  });
  const shared = loader.createPlaybackStreamRequest('tmdb:1421:6:4', 'series');
  const unsubscribe = shared.subscribe(snapshot => progress.push(snapshot));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(await shared.canonicalId, 'tt1442437:6:4');
  assert.ok(progress.some(snapshot => snapshot.pending === 1 && snapshot.streams.length === 1), 'Stream picker receives fast addon results while another is pending');
  unsubscribe(); // A route transition must not cancel the promise the player joined.
  finish();
  const result = await shared.promise;
  assert.equal(calls.length, 3);
  assert.equal(result[0].addonId, 'first', 'Final selection preserves addon order, regardless of arrival order');
  assert.ok(calls.slice(1).every(url => url.includes('mediaItemId=tt1442437%3A6%3A4')));
  console.log('PASS: page titles/artwork seed playback, shared streams survive route changes, target identities isolate episodes, Navigator uses the same command, and partial addons stream progressively.');
})().catch(error => { console.error(error); process.exitCode = 1; });
