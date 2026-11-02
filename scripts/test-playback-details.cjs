const assert = require('node:assert/strict');
const { load } = require('./test-support/react-hooks.cjs');
const artwork = load('lib/artwork.ts', {}, { URLSearchParams });
const metadata = load('lib/media/playback-details.ts', {
  '@/lib/artwork': artwork, '@/lib/series-route': load('lib/series-route.ts'),
});
const tick = () => new Promise(resolve => setImmediate(resolve));
(async () => {
  const seeded = metadata.initialPlaybackDetails({ id: 'tt1442437:8:16', type: 'series', name: 'Basketball', showName: 'Modern Family' });
  assert.equal(seeded.id, 'tt1442437');
  assert.ok(seeded.logo.includes('kind=logo'), 'The wordmark starts independently of metadata and streams');
  const merged = metadata.mergePlaybackDetails({ ...seeded, imdbRating: '8.5' }, { ...seeded, releaseInfo: '2009–2020', logo: undefined, imdbRating: '' });
  assert.equal(merged.year, 2009);
  assert.equal(merged.imdbRating, '8.5');
  assert.equal(merged.logo, seeded.logo);
  assert.equal(metadata.mergePlaybackDetails(merged, { ...seeded, year: 0, logo: '  ' }).year, 2009);
  const movie = metadata.initialPlaybackDetails({ id: 'tmdb:157336', name: 'Interstellar', type: 'movie' });
  assert.equal(movie.name, 'Interstellar');
  assert.ok(movie.logo.includes('kind=logo'));

  let authenticated = true, calls = [];
  const details = { ...merged, runtime: '21 min', cast: ['Actor'], videos: Array.from({ length: 250 }, (_, i) => ({ id: `tt1442437:8:${i + 1}`, season: 8, episode: i + 1 })) };
  const { GET } = load('app/api/playback/details/route.ts', {
    '@/app/actions/auth': { getAuthData: async () => { if (!authenticated) throw Error('auth'); } },
    '@/app/actions/media': { fetchMediaDetails: async (...args) => { calls.push(args); return details; } },
    '@/lib/media/playback-details': metadata,
  }, { Request, Response, URL });
  const request = params => new Request('http://app/api/playback/details?' + params);
  assert.equal((await GET(request('id=https://bad.test&type=series'))).status, 400);
  assert.equal((await GET(request('id=tt1442437&type=series&season=-1'))).status, 400);
  authenticated = false;
  assert.equal((await GET(request('id=tt1442437&type=series'))).status, 401);
  assert.equal(calls.length, 0);
  authenticated = true;
  const response = await GET(request('id=tt1442437&type=series&season=8&episode=16'));
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('vary'), 'Cookie');
  const body = await response.json();
  assert.equal(body.details.videos.length, 1, 'Never send whole seasons in the player metadata response');
  assert.equal(body.details.videos[0].episode, 16);
  assert.equal(body.details.imdbRating, '8.5');
  assert.equal(body.details.logo, seeded.logo);
  assert.equal(calls[0][3].playback, true);
  assert.ok(calls[0][2] instanceof AbortSignal);
  assert.equal(metadata.projectPlaybackDetails(details).videos, undefined);

  let clientRequest;
  const client = load('lib/media/fetch-playback-details.ts', { './playback-details': metadata }, {
    URLSearchParams, AbortSignal, fetch: async (url, options) => { clientRequest = { url, options }; return Response.json(body); },
  });
  const controller = new AbortController();
  await client.fetchPlaybackDetails({ id: 'tt1442437:8:16', type: 'series', name: 'Basketball', seasonNumber: 8, episodeNumber: 16 }, controller.signal);
  assert.equal(new URL(clientRequest.url, 'http://app').searchParams.get('id'), 'tt1442437');
  assert.equal(clientRequest.options.cache, 'no-store');
  controller.abort(); assert.equal(clientRequest.options.signal.aborted, true);

  const pending = [];
  const media = load('app/actions/media.ts', {
    '@/lib/artwork': artwork, '@/lib/media/playback-details': metadata,
    '@/lib/media-description': { completeMediaDescription() { throw Error('Playback must not wait for synopsis repair'); } },
    '@/lib/tmdb-artwork': {}, '@/lib/stremio-watched': {}, './tv-shows': {},
    './auth': { getInstalledAddons: async () => ['first', 'second', 'slow'].map(name => ({ transportUrl: `https://${name}.test/manifest.json`, manifest: { resources: ['meta'] } })) },
  }, { AbortController, AbortSignal, fetch: (url, init) => new Promise(resolve => { pending.push({ url, init, resolve }); }) });
  let done = false;
  const reading = media.fetchMediaDetails('tt1442437', 'series', undefined, { playback: true }).then(value => { done = true; return value; });
  await tick();
  assert.equal(pending.length, 3, 'All metadata providers start together');
  pending[0].resolve(Response.json({ meta: { id: 'tt1442437', type: 'series', name: 'Modern Family', releaseInfo: '2009–2020', runtime: '21 min', description: 'Truncated…' } }));
  await tick(); assert.equal(done, false, 'A partial first provider must not lose the rating from another provider');
  pending[1].resolve(Response.json({ meta: { id: 'tt1442437', type: 'series', name: 'Modern Family', imdbRating: '8.5', cast: ['Actor'] } }));
  const enriched = await reading;
  assert.equal(enriched.year, 2009);
  assert.equal(enriched.runtime, '21 min');
  assert.equal(enriched.imdbRating, '8.5');
  assert.equal(enriched.cast[0], 'Actor');
  assert.ok(enriched.logo);
  assert.equal(done, true, 'Complete core metadata returns without waiting for a slow provider or synopsis');
  pending[2].resolve(new Response(null, { status: 404 }));
  console.log('PASS: immediate artwork, merged year/rating/runtime/cast, independent bounded provider reads, no synopsis wait, private projected HTTP metadata, and cancellation.');
})().catch(error => { console.error(error); process.exitCode = 1; });
