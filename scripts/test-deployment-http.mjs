import assert from 'node:assert/strict';

const target = process.argv[2];
if (!target) throw new Error('Usage: node scripts/test-deployment-http.mjs https://your-navigator-host');
const origin = new URL(target);
assert.ok(['http:', 'https:'].includes(origin.protocol));
const request = (path, init = {}) => fetch(new URL(path, origin), {
  redirect: 'manual', signal: AbortSignal.timeout(45_000), ...init,
});

const legacyLogin = await request('/login');
assert.equal(legacyLogin.status, 307, 'The legacy login route must open the sign-in dialog');
const loginTarget = new URL(legacyLogin.headers.get('location'), origin);
assert.equal(loginTarget.pathname, '/');
assert.equal(loginTarget.searchParams.get('signIn'), '1');
const login = await request('/?signIn=1');
assert.equal(login.status, 200, 'The guest home and sign-in entry must render in the deployed runtime');
assert.match(login.headers.get('content-type') ?? '', /text\/html/);
const html = await login.text();
assert.match(html, /Navigator/);
const asset = html.match(/(?:src|href)="([^"\s]*\/_next\/static\/[^"\s]+\.(?:js|css)(?:\?[^"\s]*)?)"/);
assert.ok(asset, 'Rendered HTML must reference real Next.js assets');
const loaded = await request(asset[1].replaceAll('&amp;', '&'));
assert.equal(loaded.status, 200, 'A referenced production asset must be served');
assert.match(loaded.headers.get('content-type') ?? '', /javascript|css/);
console.log('PASS: rendered guest home/sign-in entry, legacy login redirect and referenced production asset');

const protectedPage = await request('/settings');
assert.ok([302, 307].includes(protectedPage.status));
const signIn = new URL(protectedPage.headers.get('location'), origin);
assert.equal(signIn.pathname, '/');
assert.equal(signIn.searchParams.get('signIn'), '1');
// An unsigned synthetic cookie must not establish a session or reach authenticated data.
const syntheticCookie = encodeURIComponent(JSON.stringify({
  authKey: 'deployment-smoke-not-a-real-token', user: { _id: 'deployment-smoke' },
}));
const cookieRouting = await request('/settings', { headers: { Cookie: `stremio-auth=${syntheticCookie}` } });
assert.equal(cookieRouting.status, 307, 'An unsigned cookie must not access account settings');
const forgedTarget = new URL(cookieRouting.headers.get('location'), origin);
assert.equal(forgedTarget.pathname, '/');
assert.equal(forgedTarget.searchParams.get('signIn'), '1');
console.log('PASS: anonymous redirects and forged-cookie rejection');

await Promise.all([
  ['/api/search/suggestions?q=', 400],
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

const suggestions = await request('/api/search/suggestions?q=modern%20family');
assert.equal(suggestions.status, 200, 'Public discovery must be available to guests');
assert.match(suggestions.headers.get('cache-control') ?? '', /private.*no-store/);
const discovery = JSON.parse((await suggestions.text()).trim());
assert.ok(discovery.sections?.some(section => section.items?.length > 0), 'Guest search must return TMDB results');
console.log('PASS: public guest search and private response caching');

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
assert.equal(artwork.status, 307, 'Public discovery artwork must be available to guests');
assert.equal(new URL(artwork.headers.get('location')).hostname, 'image.tmdb.org');
assert.match(artwork.headers.get('cache-control') ?? '', /private/);
console.log('PASS: guest artwork resolves to the TMDB image host with private caching');
console.log(`PASS: deployment smoke checks for ${origin.origin}`);
