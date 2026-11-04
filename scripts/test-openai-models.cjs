const assert = require('node:assert/strict');
const { load, hooks } = require('./test-support/react-hooks.cjs');

const constants = load('lib/models-dev.ts', {}, { URL });
const tick = () => new Promise(resolve => setImmediate(resolve));

function route(fetch, env = {}, signal = AbortSignal) {
    return load('app/api/openai/models/route.ts', {
        'next/server': { NextResponse: { json: (value, init) => Response.json(value, init) } },
        '@/lib/models-dev': constants,
    }, { Request, Response, URL, AbortSignal: signal, fetch, process: { env } }).POST;
}
function request(baseUrl, apiKey = 'personal-key') {
    return new Request('http://navigator.test/api/openai/models', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-openai-api-key': apiKey },
        body: JSON.stringify({ baseUrl }),
    });
}
function deferred() {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}
function mount() {
    const host = hooks(), timers = new Map(), calls = [];
    let timerId = 0, props = { enabled: true, baseUrl: 'https://custom.test/v1', apiKey: 'key-one' };
    const window = {
        setTimeout: (callback, delay) => { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
        clearTimeout: id => timers.delete(id),
    };
    const { useOpenAIModels } = load('components/settings/use-openai-models.ts', { react: host.react }, {
        window, AbortController,
        fetch: (url, options) => { const pending = deferred(); calls.push({ url, options, ...pending }); return pending.promise; },
    });
    const render = (next = {}) => {
        props = { ...props, ...next };
        host.render(useOpenAIModels, props); host.flush();
        return host.render(useOpenAIModels, props);
    };
    return { host, timers, calls, render, advance(delay) {
        for (const [id, timer] of [...timers]) if (timer.delay === delay) { timers.delete(id); void timer.callback(); }
    } };
}

async function main() {
    // A private host can never be discovered by the previous public-catalog lookup.
    assert.equal(constants.matchModelsDevProvider({ openai: { api: 'https://api.openai.com/v1', models: {} } }, 'https://custom.test/v1'), null);

    let captured;
    let handler = route(async (url, options) => {
        captured = { url, options };
        return Response.json({ data: [{ id: 'gpt-6-luna' }, { id: 'gpt-6-astra', name: 'Astra' }, { id: 'gpt-6-luna' }, { id: '' }, null, { id: 5 }] });
    });
    let response = await handler(request('https://custom.test/v1/'));
    assert.equal(response.status, 200);
    let payload = await response.json();
    assert.deepEqual(payload.models, [{ id: 'gpt-6-astra', name: 'Astra' }, { id: 'gpt-6-luna', name: 'gpt-6-luna' }]);
    assert.equal(captured.url.href, 'https://custom.test/v1/models');
    assert.equal(captured.options.headers.Authorization, 'Bearer personal-key');
    assert.equal(captured.options.cache, 'no-store');
    assert.equal(captured.options.redirect, 'error');
    assert.ok(captured.options.signal);
    assert.equal(response.headers.get('cache-control'), 'no-store');

    handler = route(async (url, options) => { captured = { url, options }; return Response.json({ data: [] }); }, { OPENAI_API_KEY: 'shared-server-key' });
    await handler(request('https://custom.test/CaseSensitive/v1/', ''));
    assert.equal(captured.url.pathname, '/CaseSensitive/v1/models');
    assert.equal(captured.options.headers.Authorization, undefined, 'Never send a shared server key to a custom host');
    await handler(request(constants.OPENAI_DEFAULT_BASE_URL, ''));
    assert.equal(captured.options.headers.Authorization, 'Bearer shared-server-key');

    for (const baseUrl of ['not-a-url', 'file:///tmp/private', 'https://user:secret@custom.test/v1']) {
        assert.equal((await handler(request(baseUrl))).status, 400);
    }
    for (const status of [401, 403, 404, 500]) {
        response = await route(async () => new Response('private provider diagnostic', { status }))(request('https://custom.test/v1'));
        assert.equal(response.status, status);
        const text = await response.text();
        assert.ok(!text.includes('personal-key') && !text.includes('private provider diagnostic'));
    }
    response = await route(async () => Response.json({ wrong: [] }))(request('https://custom.test/v1'));
    assert.equal(response.status, 502);
    const expired = AbortSignal.abort();
    response = await route(async () => { throw new Error('timeout'); }, {}, { timeout: () => expired, any: signals => AbortSignal.any(signals) })(request('https://custom.test/v1'));
    assert.equal(response.status, 504);
    assert.match((await response.json()).error, /timed out/i);

    let field = mount();
    assert.equal(field.render().loading, true);
    assert.equal(field.calls.length, 0, 'Typing is debounced');
    field.advance(300);
    assert.equal(field.calls[0].url, '/api/openai/models');
    assert.equal(field.calls[0].options.method, 'POST');
    assert.equal(field.calls[0].options.headers['x-openai-api-key'], 'key-one');
    assert.deepEqual(JSON.parse(field.calls[0].options.body), { baseUrl: 'https://custom.test/v1' });
    field.calls[0].resolve(Response.json({ models: [{ id: 'gpt-6-luna', name: 'gpt-6-luna' }] }));
    await tick();
    assert.equal(field.render().loading, false);
    assert.equal(field.render().models[0].id, 'gpt-6-luna');
    assert.equal(field.render().error, null);

    field.render({ apiKey: 'key-two' }); field.advance(300);
    const stale = field.calls[1];
    assert.equal(stale.options.headers['x-openai-api-key'], 'key-two', 'Changing the API key reloads account-specific models');
    field.render({ baseUrl: 'https://different.test/v1' });
    assert.equal(stale.options.signal.aborted, true);
    field.advance(300);
    field.calls[2].resolve(Response.json({ models: [{ id: 'new-account-model', name: 'New' }] }));
    await tick();
    stale.resolve(Response.json({ models: [{ id: 'stale-model', name: 'Old' }] }));
    await tick();
    assert.equal(field.render().models[0].id, 'new-account-model', 'Late results must not overwrite a newer URL/account');
    field.host.unmount();

    field = mount(); field.render(); field.advance(300); field.advance(15_000);
    assert.equal(field.calls[0].options.signal.aborted, true);
    assert.equal(field.render().loading, false, 'Even a fetch that ignores abort must not leave a spinner');
    assert.match(field.render().error, /timed out/i);
    field.calls[0].resolve(Response.json({ models: [{ id: 'late', name: 'Late' }] })); await tick();
    assert.equal(field.render().models.length, 0);
    field.host.unmount();

    field = mount(); field.render(); field.advance(300);
    field.calls[0].resolve(Response.json({ error: 'API key rejected' }, { status: 401 })); await tick();
    assert.equal(field.render().loading, false); assert.equal(field.render().error, 'API key rejected');
    field.render({ enabled: false });
    assert.equal(field.render().loading, false); assert.equal(field.render().error, null);
    assert.equal(field.timers.size, 0); field.host.unmount();

    field = mount(); field.render(); field.advance(300);
    const before = field.host.updates; field.host.unmount();
    assert.equal(field.calls[0].options.signal.aborted, true);
    field.calls[0].resolve(Response.json({ models: [] })); await tick();
    assert.equal(field.host.updates, before, 'Unmounted requests must not update state');
    assert.equal(field.timers.size, 0);

    console.log('PASS: live-provider discovery, credentials, URL validation, upstream errors/timeouts, debounce, key changes, stale responses, timeout recovery and unmount cleanup.');
    if (process.argv.includes('--live')) {
        const baseUrl = process.env.OPENAI_COMPATIBLE_BASE_URL;
        const apiKey = process.env.OPENAI_COMPATIBLE_API_KEY;
        assert.ok(baseUrl && apiKey, 'Live check requires OPENAI_COMPATIBLE_BASE_URL and OPENAI_COMPATIBLE_API_KEY');
        response = await route(fetch)(request(baseUrl, apiKey));
        payload = await response.json();
        assert.equal(response.status, 200, payload.error);
        assert.ok(payload.models.some(model => model.id === 'gpt-6-luna'));
        console.log(`PASS: actual Navigator route returned ${payload.models.length} live models including gpt-6-luna.`);
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
