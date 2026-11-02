const assert = require('node:assert/strict');
const { load } = require('./test-support/react-hooks.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const globals = { Request, Response, URL, URLSearchParams, ReadableStream, TextEncoder, TextDecoder, AbortController, AbortSignal };
(async () => {
  let signedIn = false, active = 0, peak = 0;
  const jobs = new Map();
  const targets = Array.from({ length: 6 }, (_, i) => ({ transportUrl: `addon-${i}` }));
  const { GET } = load('app/api/search/suggestions/route.ts', {
    '@/app/actions/auth': { getAuthData: async () => { if (!signedIn) throw Error('unauthorized'); } },
    '@/app/actions/search': {
      listSearchAddonTargets: async () => targets,
      searchCatalogSectionsForAddon: (_query, id, signal) => new Promise((resolve, reject) => {
        active++; peak = Math.max(peak, active);
        const finish = value => { active--; resolve([{ key: id, items: [value] }]); };
        jobs.set(id, { signal, finish });
        signal.addEventListener('abort', () => { active--; reject(signal.reason); }, { once: true });
      }),
    },
  }, globals);
  assert.equal((await GET(new Request('http://app/api/search/suggestions?q=hi'))).status, 400);
  assert.equal((await GET(new Request('http://app/api/search/suggestions?q=test'))).status, 401);
  assert.equal(jobs.size, 0);
  signedIn = true;
  const request = new AbortController();
  const response = await GET(new Request('http://app/api/search/suggestions?q=test', { signal: request.signal }));
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const reader = response.body.getReader();
  assert.equal(jobs.size, 4, 'Providers run concurrently with a bounded fan-out');
  jobs.get('addon-1').finish({ name: 'Fast result' });
  const chunk = new TextDecoder().decode((await reader.read()).value);
  assert.ok(chunk.includes('Fast result'), 'A fast provider streams before the first slow provider');
  await tick();
  assert.equal(jobs.size, 5, 'The next provider starts as capacity is released');
  assert.equal(peak, 4);
  await reader.cancel(); await tick();
  assert.ok([...jobs.values()].every(job => job.signal.aborted), 'Closing the read cancels all upstream work');

  const encoder = new TextEncoder();
  const results = [];
  let cancelled = false;
  const sections = [{ key: 'one', items: [{ name: 'Épisode' }] }];
  const bytes = encoder.encode(JSON.stringify({ sections }) + '\n' + JSON.stringify({ sections: [{ key: 'two', items: [] }] }));
  const helper = load('lib/search-catalog-stream.ts', {}, { ...globals, fetch: async () => new Response(new ReadableStream({
    start(controller) { for (const byte of bytes) controller.enqueue(new Uint8Array([byte])); controller.close(); },
  })) });
  await helper.fetchSearchSuggestions('test', rows => results.push(...rows), new AbortController().signal);
  assert.equal(results.length, 2);
  assert.equal(results[0].items[0].name, 'Épisode', 'UTF-8 and JSON may span arbitrary network chunks');
  const broken = load('lib/search-catalog-stream.ts', {}, { ...globals, fetch: async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(encoder.encode('invalid json\n')); }, cancel() { cancelled = true; },
  })) });
  await assert.rejects(broken.fetchSearchSuggestions('test', () => {}, new AbortController().signal));
  assert.equal(cancelled, true, 'Malformed streams must release their network reader');

  let upstreamSignal;
  const actions = load('app/actions/search.ts', {
    react: { cache: fn => fn }, '@/lib/artwork': { artworkUrl: () => '/poster' },
    './auth': { getInstalledAddons: async () => [{ transportUrl: 'https://addon.test', manifest: {
      id: 'one', name: 'One', catalogs: [{ id: 'top', type: 'movie', extra: [{ name: 'search' }] }],
    } }] },
  }, { ...globals, console: { error() {} }, fetch: async (_url, init) => {
    upstreamSignal = init.signal;
    return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true }));
  } });
  const abort = new AbortController();
  const work = actions.searchCatalogSectionsForAddon('test', 'https://addon.test', abort.signal);
  await tick(); abort.abort();
  await assert.rejects(work);
  assert.equal(upstreamSignal.aborted, true);
  console.log('PASS: authenticated read streaming, provider concurrency, fast partial results, cancellation propagation, split UTF-8 chunks and reader cleanup.');
})().catch(error => { console.error(error); process.exitCode = 1; });
