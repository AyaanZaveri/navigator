// Loaded only by test-navigation.mjs (or NODE_OPTIONS during browser QA).
// Keep slow services deterministic without a real Stremio account or addons.
const originalFetch = globalThis.fetch;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const picture = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="720"><rect width="480" height="720" fill="#334155"/></svg>'
);
const media = (type, id) => ({
    id,
    type,
    name: type === 'series' ? 'Navigation Test Show' : 'Navigation Test Movie',
    description: 'Navigation fixture description',
    poster: picture,
    background: picture,
    genres: ['Drama'],
    videos: type === 'series' ? Array.from({ length: 6 }, (_, i) => ({
        id: `${id}:1:${i + 1}`,
        season: 1,
        episode: i + 1,
        title: `Fixture Episode ${i + 1}`,
        overview: 'Episode overview',
        thumbnail: picture,
        released: '2024-01-01',
    })) : undefined,
});

globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url || input.toString();
    if (url.startsWith('https://api.strem.io/api/')) {
        const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
        if (body.authKey === 'navigation-perf-fixture') {
            if (url.endsWith('addonCollectionGet')) {
                return Response.json({ result: { addons: [{
                    transportUrl: 'https://navigation-fixture.invalid/manifest.json',
                    manifest: {
                        id: 'navigation-fixture',
                        name: 'Navigation Fixture',
                        version: '1.0.0',
                        resources: ['meta', 'catalog'],
                        types: ['movie', 'series'],
                        catalogs: [
                            { id: 'top', type: 'movie', name: 'Movies' },
                            { id: 'top', type: 'series', name: 'Shows' },
                        ],
                    },
                }] } });
            }
            if (url.endsWith('datastoreGet')) {
                await pause(1200);
                return Response.json({ result: body.all ? [] : [{ state: {
                    video_id: body.ids[0] === 'show-1' ? 'show-1:1:2' : body.ids[0],
                    timeOffset: 60000,
                    duration: 120000,
                } }] });
            }
            throw new Error(`Unexpected fixture API request: ${url}`);
        }
    }
    if (url.startsWith('https://navigation-fixture.invalid/')) {
        if (url.includes('/meta/')) {
            const [type, id] = url.split('/meta/')[1].replace('.json', '').split('/');
            await pause(id.endsWith('-slow') ? 1200 : 30);
            return Response.json({ meta: media(type, id) });
        }
        if (url.includes('/catalog/')) {
            await pause(1200);
            const type = url.split('/catalog/')[1].split('/')[0];
            return Response.json({ metas: Array.from({ length: 8 }, (_, i) =>
                media(type, `${type === 'series' ? 'show' : 'movie'}-${i + 1}`)
            ) });
        }
        throw new Error(`Unexpected fixture addon request: ${url}`);
    }
    return originalFetch(input, init);
};
