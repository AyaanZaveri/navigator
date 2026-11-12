const assert = require('node:assert/strict');
const { load } = require('./test-support/react-hooks.cjs');
async function main() {
 let upstream = 0, signal, authReads = 0, logged = 0;
 const { GET } = load('app/api/streams/addon/route.ts', {
  'next/server': { NextResponse: { json: (value, options) => Response.json(value, options) } },
  '@/app/actions/auth': { getInstalledAddons: async () => { authReads++; return [{ manifest: { id: 'owned', resources: ['stream'], name: 'Owned' }, transportUrl: 'https://provider.example/manifest.json' }]; } },
  '@/lib/server/outbound-fetch': { outboundFetch: async (url, options) => { upstream++; signal = options.signal; return new Promise((resolve, reject) => { options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }); }); } },
 }, { Response, URL, console: { error: () => logged++ } });
 const abort = new AbortController();
 const response = GET(new Request('https://app.example/api/streams/addon?mediaItemId=tt123&type=movie&addonId=owned', { signal: abort.signal }));
 await new Promise(resolve => setImmediate(resolve));
 assert.ok(signal instanceof AbortSignal, 'Forward the request cancellation signal to the guarded upstream fetch');
 abort.abort(new Error('closed playback'));
 assert.equal(signal.aborted, true);
 assert.equal((await response).status, 499);
 assert.equal(logged, 0, 'Expected cancellation is not an upstream error');
 const before = authReads;
 const cancelled = await GET(new Request('https://app.example/api/streams/addon?mediaItemId=tt123&addonId=owned', { signal: AbortSignal.abort() }));
 assert.equal(cancelled.status, 499); assert.equal(authReads, before); assert.equal(upstream, 1);
 const foreign = await GET(new Request('https://app.example/api/streams/addon?mediaItemId=tt123&addonId=foreign'));
 assert.equal(foreign.status, 404); assert.equal(upstream, 1, 'Cancellation support cannot bypass add-on ownership');
 console.log('PASS: upstream add-on cancellation, already-aborted requests, quiet cancellation and ownership checks');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
