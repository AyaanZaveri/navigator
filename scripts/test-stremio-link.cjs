const assert = require('node:assert/strict');
const { load } = require('./test-support/react-hooks.cjs');

async function main() {
    const jose = await import('jose');
    const crypto = require('node:crypto').webcrypto;
    const env = { NODE_ENV: 'production', NAVIGATOR_SESSION_SECRET: 'a1'.repeat(32) };
    const globals = { process: { env }, crypto, Uint8Array, TextEncoder, TextDecoder, Date, Error, AbortSignal,
        console: { error() {} } };
    const session = load('lib/server/session.ts', { 'server-only': {}, jose }, globals);
    const flow = await session.sealStremioLink('ABCD', 'attempt-one');
    assert.equal(await session.readStremioLink(flow, 'attempt-one'), 'ABCD');
    assert.equal(await session.readStremioLink(flow, 'another-browser'), null);
    assert.equal(await session.readStremioLink(flow.slice(0, -8), 'attempt-one'), null);
    assert.equal(await session.readSession(flow), null, 'A pairing cookie is never an app session');
    const expired = await new jose.EncryptJWT({ code: 'ABCD' }).setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
        .setIssuer('navigator').setAudience('navigator-stremio-link').setSubject('attempt-one').setIssuedAt(1).setExpirationTime(2)
        .encrypt(Buffer.from(env.NAVIGATOR_SESSION_SECRET, 'hex'));
    assert.equal(await session.readStremioLink(expired, 'attempt-one'), null);

    const jar = new Map(), writes = [], requests = [];
    let approved = false, code = 'ABCD';
    const user = { _id: 'fixture-user', email: 'fixture@example.invalid' };
    const auth = load('app/actions/auth.ts', {
        'next/headers': { cookies: async () => ({
            get: name => jar.has(name) ? { value: jar.get(name) } : undefined,
            set: (name, value, options) => { jar.set(name, value); writes.push({ name, value, options }); },
            delete: name => jar.delete(name),
        }) },
        'next/navigation': {}, '@/lib/cookie-policy': { cookieRequiresHttps: () => true },
        '@/lib/server/auth': {}, '@/lib/server/session': session,
    }, { ...globals, fetch: async (url, init) => {
        requests.push({ url, init });
        assert.equal(init.cache, 'no-store'); assert.equal(init.redirect, 'manual'); assert.ok(init.signal);
        if (url.includes('/create')) return Response.json({ result: { code } });
        if (url.includes('/read')) return Response.json(approved ? { result: { authKey: 'private-linked-auth-key' } } : { error: { code: 101 } });
        assert.equal(url, 'https://api.strem.io/api/getUser');
        assert.equal(JSON.parse(init.body).authKey, 'private-linked-auth-key');
        return Response.json({ result: user });
    } });
    assert.equal((await auth.finishStremioSignIn('no-flow')).status, 'expired');
    assert.equal(requests.length, 0);
    code = 'https://attacker.invalid';
    assert.equal((await auth.startStremioSignIn()).success, false);
    assert.equal(writes.length, 0);
    code = 'ABCD';
    const started = await auth.startStremioSignIn();
    assert.equal(started.success, true);
    assert.equal(started.link, 'https://link.stremio.com/ABCD');
    assert.equal(writes[0].name, session.STREMIO_LINK_COOKIE);
    assert.equal(writes[0].options.httpOnly, true); assert.equal(writes[0].options.secure, true);
    assert.equal(writes[0].options.maxAge, 300);
    const requestCount = requests.length;
    assert.equal((await auth.finishStremioSignIn('wrong-attempt')).status, 'expired');
    assert.equal(requests.length, requestCount, 'A foreign or stale attempt never reads a pairing code');
    assert.equal((await auth.finishStremioSignIn(started.attempt)).status, 'pending');
    assert.equal(jar.has(session.SESSION_COOKIE), false);
    approved = true;
    const finished = await auth.finishStremioSignIn(started.attempt);
    assert.equal(finished.status, 'signed-in');
    assert.ok(!JSON.stringify(finished).includes('private-linked-auth-key'));
    assert.equal((await session.readSession(jar.get(session.SESSION_COOKIE))).authKey, 'private-linked-auth-key');
    assert.equal(jar.has(session.STREMIO_LINK_COOKIE), false);
    assert.equal((await auth.finishStremioSignIn(started.attempt)).status, 'expired', 'Completed pairing cannot be replayed');
    console.log('PASS: encrypted browser-bound Stremio pairing, expiry/tamper/replay rejection, pending/approved flows, fixed endpoints, HttpOnly session issuance and no client authKey exposure.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
