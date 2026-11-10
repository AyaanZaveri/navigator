const assert = require('node:assert/strict');
const { load, hooks } = require('./test-support/react-hooks.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));

(async () => {
    const host = hooks(), requests = [], listeners = new Map(), intervals = new Map();
    const window = { location: { href: '/', origin: 'https://navigator.example', replace(url) { this.href = url; } },
        setInterval(fn, delay) { assert.equal(delay, 60_000); intervals.set(1, fn); return 1; },
        clearInterval(id) { intervals.delete(id); },
        addEventListener(name, fn) { listeners.set(name, fn); },
        removeEventListener(name) { listeners.delete(name); },
    };
    const { useAuth } = load('hooks/useAuth.ts', { react: host.react }, { window, AbortController, Date, URL,
        fetch: (url, options) => url.endsWith('/logout') ? Response.json({ success: true }) : new Promise(resolve => requests.push({ url, options, resolve })),
    });
    const render = () => { const state = host.render(useAuth); host.flush(); return state; };
    assert.equal(render().isLoading, true);
    await tick();
    assert.equal(requests.length, 1);
    assert.equal(requests[0].options.cache, 'no-store');
    assert.equal(requests[0].options.credentials, 'same-origin');
    const profile = { _id: 'verified-user', email: 'fixture@example.invalid' };
    requests[0].resolve(Response.json({ user: profile, timestamp: Date.now() })); await tick();
    const state = render(); assert.equal(state.user._id, profile._id); assert.equal(state.user.authKey, undefined);
    state.login({ _id: 'forged-user', email: 'attacker@example.invalid' });
    assert.equal(render().user._id, profile._id, 'A client callback cannot manufacture authenticated state');
    requests[1].resolve(Response.json({ user: null, timestamp: null }, { status: 401 })); await tick();
    assert.equal(render().isAuthenticated, false);
    listeners.get('focus')();
    const pending = requests.at(-1);
    await state.logout();
    assert.equal(window.location.href, "https://navigator.example/");
    host.unmount(); assert.equal(pending.options.signal.aborted, true);
    assert.equal(listeners.size, 0); assert.equal(intervals.size, 0);
    const updates = host.updates;
    pending.resolve(Response.json({ user: profile, timestamp: Date.now() })); await tick();
    assert.equal(host.updates, updates, 'A completed request cannot restore a session after unmount');
    console.log('PASS: profile-only browser auth, no trusted client login, unauthorized refresh, focus synchronization and aborted/unmounted cleanup.');
})().catch(error => { console.error(error); process.exitCode = 1; });
