const assert = require('node:assert/strict');
const { load, hooks } = require('./test-support/react-hooks.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
async function main() {
    const host = hooks(), calls = [], timers = new Map();
    let timerId = 0, provider = 'groq';
    const { useCatalogModels } = load('components/settings/use-catalog-models.ts', { react: host.react }, {
        URLSearchParams, AbortController,
        window: {
            setTimeout: callback => { timers.set(++timerId, callback); return timerId; },
            clearTimeout: id => timers.delete(id),
        },
        fetch: (url, options) => new Promise(resolve => calls.push({ url, options, resolve })),
    });
    const render = next => {
        if (next !== undefined) provider = next;
        host.render(useCatalogModels, provider); host.flush();
        return host.render(useCatalogModels, provider);
    };
    assert.equal(render().loading, true);
    assert.equal(calls[0].url, '/api/models-dev/provider?providerId=groq');
    render('openrouter');
    assert.ok(calls[0].options.signal.aborted, 'Switching providers cancels stale requests');
    calls[0].resolve(Response.json({ provider: { models: [{ id: 'stale', name: 'Stale' }] } }));
    calls[1].resolve(Response.json({ provider: { models: [{ id: 'meta/llama', name: 'Llama', family: 'llama' }] } }));
    await tick();
    let state = render();
    assert.equal(state.models[0].id, 'meta/llama');
    assert.equal(state.models[0].family, 'llama', 'Preserve model family for bundled icons');
    assert.equal(state.loading, false);
    render('opencode-go');
    calls[2].resolve(Response.json({ provider: { models: [] } }));
    await tick();
    assert.match(render().error, /saved model/);
    assert.equal(render('openrouter').models[0].id, 'meta/llama');
    assert.equal(calls.length, 3, 'Returning to a cached catalog does not refetch');
    render('groq');
    assert.equal(calls.length, 4, 'Canceled results are never cached');
    for (const callback of [...timers.values()]) callback();
    assert.match(render().error, /timed out/);
    assert.equal(render().loading, false);
    assert.equal(render(null).models.length, 0);
    host.unmount();
    console.log('PASS: provider catalogs, family icons metadata, stale-request isolation, caching, empty lists, timeout, and cleanup');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
