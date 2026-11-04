const assert = require('node:assert/strict');
const React = require('react');
const { load } = require('./test-support/react-hooks.cjs');
const calls = [];
let fail = false;
const { default: Page } = load('app/(main)/search/page.tsx', {
    react: React,
    'react/jsx-runtime': require('react/jsx-runtime'),
    'next/link': 'a',
    'lucide-react': { SearchIcon: 'icon' },
    '@/components/vibrant-aurora-background': { VibrantAuroraBackground: 'aurora' },
    '@/components/media-card': { MediaCard: 'media-card' },
    '@/components/search-section-loading': { SearchSectionLoading: 'loading' },
    '@/app/actions/auth': { getAuthData: async () => ({}) }, "@/lib/server/auth": { getAuthData: async () => ({}) },
    '@/lib/tmdb-discovery': { searchTMDBMedia: async (query, _signal, type, page) => {
        calls.push({ query, type, page });
        if (fail) throw new Error('Add your TMDB read access token in Settings → TMDB.');
        return { results: [{ id: `tmdb:${type === 'movie' ? 123 : 20}`, name: 'Example', type, year: 2020 }], totalPages: 3, totalResults: 41 };
    } },
}, { Error, URLSearchParams });
function all(node) {
    if (!node || typeof node !== 'object') return [];
    return [node, ...React.Children.toArray(node.props?.children).flatMap(all)];
}
(async () => {
    const shell = await Page({ searchParams: Promise.resolve({ q: ' Example ', page: '2' }) });
    const results = all(shell).find(node => typeof node.type === 'function' && node.type.name === 'SearchResults');
    const body = await results.type(results.props);
    assert.deepEqual(calls.map(c => [c.query, c.type, c.page]), [['Example', 'movie', 2], ['Example', 'series', 2]]);
    assert.equal(all(body).filter(node => node.type === 'media-card').length, 2);
    const links = all(body).filter(node => node.type === 'a').map(node => node.props.href);
    assert.deepEqual(links, ['/search?q=Example&page=1', '/search?q=Example&page=3']);
    fail = true;
    const error = await results.type(results.props);
    assert.equal(error.props.role, 'alert');
    assert.match(error.props.children, /TMDB read access token/);
    console.log('PASS: TMDB-only movie/TV result sections, bounded pagination, title IDs, and visible provider errors.');
})().catch(error => { console.error(error); process.exitCode = 1; });
