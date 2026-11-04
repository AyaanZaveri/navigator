import assert from 'node:assert/strict';

const target = process.argv[2];
if (!target) throw new Error('Usage: node scripts/test-deployment-http.mjs https://your-navigator-host');
const origin = new URL(target);
assert.ok(['http:', 'https:'].includes(origin.protocol));
const request = (path, init = {}) => fetch(new URL(path, origin), {
  redirect: 'manual', signal: AbortSignal.timeout(45_000), ...init,
});

const login = await request('/login');
assert.equal(login.status, 200, 'Login must render in the deployed runtime');
assert.match(login.headers.get('content-type') ?? '', /text\/html/);
const html = await login.text();
assert.match(html, /Navigator/);
const asset = html.match(/(?:src|href)="([^"\s]*\/_next\/static\/[^"\s]+\.(?:js|css)(?:\?[^"\s]*)?)"/);
assert.ok(asset, 'Rendered HTML must reference real Next.js assets');
const loaded = await request(asset[1].replaceAll('&amp;', '&'));
assert.equal(loaded.status, 200, 'A referenced production asset must be served');
assert.match(loaded.headers.get('content-type') ?? '', /javascript|css/);
console.log('PASS: rendered login and referenced production asset');

const protectedPage = await request('/settings');
assert.ok([302, 307].includes(protectedPage.status));
assert.equal(new URL(protectedPage.headers.get('location'), origin).pathname, '/login');
// Test only the proxy's cookie-routing branch; never submit this synthetic token
// to Stremio or follow the redirect into authenticated data requests.
const syntheticCookie = encodeURIComponent(JSON.stringify({
  authKey: 'deployment-smoke-not-a-real-token', user: { _id: 'deployment-smoke' },
}));
const cookieRouting = await request('/login', { headers: { Cookie: `stremio-auth=${syntheticCookie}` } });
assert.ok([302, 307].includes(cookieRouting.status));
assert.equal(new URL(cookieRouting.headers.get('location'), origin).pathname, '/');
console.log('PASS: proxy redirects for anonymous pages and a synthetic cookie, without authenticated data requests');

await Promise.all([
  ['/api/search/suggestions?q=modern%20family', 401],
  ['/api/search/suggestions?q=a', 400],
  ['/api/playback/details?id=tt0816692&type=movie', 401],
].map(async ([path, expected]) => {
  const response = await request(path);
  assert.equal(response.status, expected, path);
  if (path.startsWith('/api/playback/details')) assert.match(response.headers.get('cache-control') ?? '', /private.*no-store/);
}));
const addons = await request('/api/streams/addons');
assert.equal(addons.status, 200);
assert.deepEqual((await addons.json()).addons, [], 'Anonymous addon listing must contain no user data');
console.log('PASS: API validation, authentication rejection, empty anonymous addon listing and private playback responses');

const invalidLogin = await request('/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: '', password: '' }),
});
assert.equal(invalidLogin.status, 400);
assert.equal((await invalidLogin.json()).success, false);
const chat = await request('/api/chat', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [] }),
});
assert.equal(chat.status, 401, 'Chat must reject unauthenticated requests before calling an AI provider');
console.log('PASS: login validation and chat runtime/authentication without provider calls');

const episode = await request('/episode/tt1442437/6/4');
assert.ok([301, 302, 307, 308].includes(episode.status));
assert.equal(new URL(episode.headers.get('location'), origin).pathname, '/series/tt1442437/6/4');
console.log('PASS: legacy episode redirect');

const artwork = await request('/api/artwork?id=tt0816692&type=movie&kind=poster');
assert.equal(artwork.status, 307, 'TMDB runtime credentials must resolve real artwork');
assert.equal(new URL(artwork.headers.get('location')).hostname, 'image.tmdb.org');
const sample = await request('/api/artwork?id=tt0816692&type=movie&kind=poster&sample=1&palette=1');
assert.equal(sample.status, 200, 'Server-side artwork byte proxy must work');
assert.match(sample.headers.get('content-type') ?? '', /^image\//);
assert.match(sample.headers.get('cache-control') ?? '', /private/);
assert.ok((await sample.arrayBuffer()).byteLength > 100);
console.log('PASS: TMDB runtime settings, artwork redirect and private image proxy');
console.log(`PASS: deployment smoke checks for ${origin.origin}`);
