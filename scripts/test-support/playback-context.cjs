const { load } = require('./react-hooks.cjs');
const artwork = load('lib/artwork.ts', {}, { URLSearchParams });
const route = load('lib/series-route.ts');
const details = load('lib/media/playback-details.ts', { '@/lib/artwork': artwork, '@/lib/series-route': route });
const titles = load('lib/media/playback-titles.ts');
module.exports = load('lib/media/playback-context.ts', { './playback-details': details, './playback-titles': titles });
module.exports.details = details;
