const assert = require('node:assert/strict');
const { QueryClient, notifyManager } = require('@tanstack/react-query');
const { load } = require('./test-support/react-hooks.cjs');
const api = load('lib/media/metadata-queries.ts', {}, { TextEncoder, URLSearchParams, fetch });
const schema = load('lib/media/metadata.ts');
const queue = [];
notifyManager.setScheduler(callback => queue.push(callback));
const client = new QueryClient();
const scope = 'notifications', revision = 'c'.repeat(64);
const queries = api.createMetadataQueries({ client, scope, peekIdentity: id => id, resolveIdentity: async id => id });
const media = { id: 'tt123', type: 'movie', name: 'Movie' };
const key = schema.metadataKey(scope, revision, media.type, media.id);
client.setQueryData(['metadata', scope, 'config'], { revision });
client.setQueryData(key, schema.titleEnvelope(media, Date.now()));
let calls = 0, release;
try {
    release = queries.observe(media, () => { calls++; });
    while (queue.length) queue.shift()();
    calls = 0;
    // HydrationBoundary can synchronously populate QueryClient during render.
    client.setQueryData(key, schema.titleEnvelope({ ...media, name: 'Hydrated' }, Date.now()));
    assert.equal(calls, 0, 'Hydration must not synchronously notify a different mounted React component');
    while (queue.length) queue.shift()();
    assert.ok(calls > 0, 'The updated header publishes through the TanStack scheduler');
    calls = 0;
    client.setQueryData(key, schema.titleEnvelope({ ...media, name: 'Unmounted' }, Date.now()));
    release(); release = undefined;
    while (queue.length) queue.shift()();
    assert.equal(calls, 0, 'Queued callbacks cannot update an unmounted header');
    console.log('PASS: metadata hydration notifications are scheduled, visible after batching, and ignored after unmount.');
} finally {
    release?.(); queries.dispose(); client.clear(); notifyManager.setScheduler(callback => setTimeout(callback, 0));
}
