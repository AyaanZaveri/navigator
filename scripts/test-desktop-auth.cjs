const assert = require('node:assert/strict');
const { load } = require('./test-support/react-hooks.cjs');

async function authenticate(env) {
    const written = [];
    const policy = load('lib/cookie-policy.ts', {}, { process: { env } });
    const actions = load('app/actions/auth.ts', {
        'next/headers': { cookies: async () => ({ set: (...args) => written.push(args) }) },
        'next/navigation': { redirect() { throw new Error('Unexpected redirect'); } },
        '@/lib/cookie-policy': policy, '@/lib/server/auth': {},
        '@/lib/server/session': { SESSION_COOKIE: 'stremio-auth', SESSION_SECONDS: 30 * 24 * 60 * 60,
            createSession: async (key, user) => { assert.equal(key, 'desktop-fixture-token'); assert.equal(user._id, 'fixture'); return 'encrypted-session'; } },
    }, { process: { env }, AbortSignal,
        fetch: async (url, options) => {
            assert.equal(url, 'https://api.strem.io/api/login');
            assert.equal(JSON.parse(options.body).email, 'desktop-fixture@example.invalid');
            assert.equal(options.cache, 'no-store');
            return Response.json({ result: { authKey: 'desktop-fixture-token', user: { _id: 'fixture', email: 'desktop-fixture@example.invalid' } } });
        } });
    assert.equal(await actions.authenticateUser('desktop-fixture@example.invalid', 'fixture-password'), true);
    assert.equal(written[0][0], 'stremio-auth'); assert.equal(written[0][1], 'encrypted-session'); assert.equal(written[0][2].httpOnly, true);
    return written[0][2];
}
(async () => {
    const desktop = await authenticate({ NODE_ENV: 'production', NAVIGATOR_DESKTOP: '1', HOSTNAME: '127.0.0.1' });
    assert.equal(desktop.secure, false); assert.equal(desktop.sameSite, 'lax'); assert.equal(desktop.path, '/'); assert.equal(desktop.maxAge, 30 * 24 * 60 * 60);
    assert.equal((await authenticate({ NODE_ENV: 'production' })).secure, true);
    assert.equal((await authenticate({ NODE_ENV: 'development' })).secure, false);
    assert.equal((await authenticate({ NODE_ENV: 'production', NAVIGATOR_DESKTOP: 'true' })).secure, true);
    assert.equal((await authenticate({ NODE_ENV: 'production', NAVIGATOR_DESKTOP: '1', HOSTNAME: '0.0.0.0' })).secure, true);
    console.log('PASS: encrypted HttpOnly cookies keep hosted HTTPS and narrowly scoped desktop loopback transport.');
})().catch(error => { console.error(error); process.exitCode = 1; });
