const assert = require('node:assert/strict');
const React = require('react');
const { load, hooks } = require('./test-support/react-hooks.cjs');
const runtime = require('react/jsx-runtime');
const calls = [];
let fail = false;
let empty = false;
const movie = { id: 'tmdb:123', name: 'Example', type: 'movie', year: 2020, popularity: 999 };
const show = { id: 'tmdb:20', name: 'Example TV', type: 'series', year: 2020, popularity: 1 };
const extra = { id: 'tmdb:99', name: 'Type-only result', type: 'movie', year: 2021 };
const css = {};
const ui = {
    react: React, 'react/jsx-runtime': runtime, 'next/link': 'a',
    'lucide-react': { SearchIcon: 'icon' },
    '@/components/ui/button': { Button: 'button' },
    '@/components/ui/empty': { Empty: 'empty', EmptyDescription: 'description', EmptyHeader: 'header', EmptyMedia: 'icon', EmptyTitle: 'title' },
    '@/components/search-page-controls': { SearchPageHeading: 'search-heading', SearchRetryButton: 'retry', SearchTypeFilters: 'search-filters' },
    '@/components/media-card': { MediaCard: 'media-card' },
};
const { default: Page } = load('app/(main)/search/page.tsx', {
    ...ui,
    '@/components/home-gradient-background': { HomeGradientBackground: 'background' },
    '@/components/home-palette-provider': { HomePaletteProvider: 'palette-provider' },
    '@/components/search-results-view': { SearchResultsView: 'results-view' },
    '@/components/search-page.module.css': css,
    '@/components/search-section-loading': { SearchSectionLoading: 'loading' },
    '@/lib/tmdb-discovery': { searchTMDBMedia: async (query, _signal, type, page) => {
        calls.push({ query, type, page });
        if (fail) throw new Error('Add your TMDB read access token in Settings → TMDB.');
        return { results: empty ? [] : type === 'movie' ? [movie, extra] : type === 'series' ? [show] : [show, movie],
            totalPages: type === 'series' ? 3 : type === 'movie' ? 5 : 4, totalResults: empty ? 0 : type ? 41 : 82 };
    } },
}, { Error });
function all(node) {
    if (!node || typeof node !== 'object') return [];
    return [node, ...React.Children.toArray(node.props?.children).flatMap(all)];
}
function text(node) {
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    return React.Children.toArray(node?.props?.children).map(text).join('');
}
let params = new URLSearchParams('q=Example');
const changes = [];
const viewHooks = hooks();
const { SearchResultsView } = load('components/search-results-view.tsx', {
    ...ui, react: { ...React, ...viewHooks.react }, './search-page.module.css': css,
    'next/navigation': { useSearchParams: () => params },
}, { URLSearchParams, window: { history: { pushState(_state, _unused, url) {
    changes.push(url); params = new URL(url, 'http://app').searchParams;
} } } });
const rows = tree => React.Children.toArray(all(tree).find(node => node.type === 'ul').props.children);
const visibleIds = tree => rows(tree).filter(row => !row.props.hidden).map(row => row.props.children.props.item.id);
const keys = tree => rows(tree).map(row => row.key).sort();
(async () => {
    const shell = await Page({ searchParams: Promise.resolve({ q: ' Example ', page: '2' }) });
    const results = all(shell).find(node => typeof node.type === 'function' && node.type.name === 'SearchResults');
    const body = await results.type(results.props);
    assert.equal(body.type, 'results-view');
    assert.deepEqual(calls.map(c => [c.type, c.page]), [['movie', 1], ['series', 1], [undefined, 1], ['movie', 2], ['series', 2], [undefined, 2]], 'Later pages include all first-page sets so segment changes never need another request');
    const props = body.props;
    let tree = viewHooks.render(SearchResultsView, props);
    assert.deepEqual(visibleIds(tree), ['tmdb:20', 'tmdb:123'], 'All preserves native multi-search order');
    const originalRows = keys(tree);
    const originalItems = rows(tree).map(row => row.props.children.props.item);
    assert.equal(rows(tree).length, 3, 'Pool contains each identity once, including type-only results');
    assert.ok(rows(tree).every(row => row.props.children.props.revealArtwork === false));
    const before = calls.length;
    for (const type of ['movie', 'series', 'all', 'movie', 'all']) {
        all(tree).find(node => node.type === 'search-filters').props.onValueChange(type);
        tree = viewHooks.render(SearchResultsView, props);
        assert.deepEqual(keys(tree), originalRows, 'Switching segments never removes/replaces a keyed card');
        assert.deepEqual(visibleIds(tree), type === 'movie' ? ['tmdb:123', 'tmdb:99'] : type === 'series' ? ['tmdb:20'] : ['tmdb:20', 'tmdb:123']);
        assert.ok(rows(tree).every(row => originalItems.includes(row.props.children.props.item)), 'Card metadata stays referentially stable');
    }
    assert.equal(calls.length, before, 'Local changes perform no data requests');
    assert.equal(changes[0], '/search?q=Example&type=movie');
    const number = changes.length;
    all(tree).find(node => node.type === 'search-filters').props.onValueChange('all');
    assert.equal(changes.length, number, 'Current segment does not add history');
    params = new URLSearchParams('q=Example&type=series&page=2');
    tree = viewHooks.render(SearchResultsView, props);
    assert.ok(all(tree).some(node => text(node) === 'Page 2 of 3'));
    assert.ok(all(tree).filter(node => node.type === 'a').every(node => node.props.href.includes('type=series')));
    all(tree).find(node => node.type === 'search-filters').props.onValueChange('movie');
    tree = viewHooks.render(SearchResultsView, props);
    assert.equal(params.has('page'), false, 'Changing type from a later page resets locally to cached page one');
    assert.deepEqual(keys(tree), originalRows);
    params = new URLSearchParams('q=Example&type=series&page=3');
    const third = { ...props, initialPage: 3, pageSets: props.pageSets.map(set => set.page === 2 ? { ...set, page: 3 } : set) };
    tree = viewHooks.render(SearchResultsView, third);
    assert.equal(all(tree).filter(node => node.type === 'a').length, 1, 'No Next past selected type’s final page');
    params = new URLSearchParams('q=Example');
    tree = viewHooks.render(SearchResultsView, props);
    assert.deepEqual(visibleIds(tree), ['tmdb:20', 'tmdb:123'], 'History navigation restores the selected view');
    empty = true;
    const noResults = await results.type(results.props);
    tree = viewHooks.render(SearchResultsView, noResults.props);
    assert.ok(all(tree).some(node => node.props?.children === 'No matching titles'));
    assert.equal(rows(tree).length, 0);
    empty = false; fail = true;
    const error = await results.type(results.props);
    assert.equal(error.props.role, 'alert');
    assert.ok(all(error).some(node => node.type === 'retry'));
    const count = calls.length;
    for (const q of ['', 'x'.repeat(301)]) {
        const invalid = await Page({ searchParams: Promise.resolve({ q }) });
        assert.ok(!all(invalid).some(node => typeof node.type === 'function' && node.type.name === 'SearchResults'));
    }
    assert.equal(calls.length, count);
    viewHooks.unmount();
    console.log('PASS: local segment/history changes, persistent card keys/metadata, no requests or artwork reveal, native per-type order/pagination, preload, empty states and errors');
})().catch(error => { console.error(error); process.exitCode = 1; });

const { searchPageUrl, searchMediaFilter } = load('lib/search-presentation.ts', {}, { URLSearchParams });
assert.equal(searchMediaFilter('invalid'), 'all');
assert.equal(searchPageUrl('a & b', 'series'), '/search?q=a+%26+b&type=series');
const headingHooks = hooks();
const scrolls = [], focuses = [];
const { SearchPageHeading } = load('components/search-page-controls.tsx', {
    ...ui, react: { ...React, ...headingHooks.react, useLayoutEffect: headingHooks.react.useEffect },
    'next/navigation': { useSearchParams: () => params },
    '@/components/arc/segmented-control/segmented-control': 'segments', './search-page.module.css': css,
}, { document: { title: '', querySelector: () => ({ scrollTo: options => scrolls.push(options) }) } });
const heading = headingHooks.render(SearchPageHeading, { query: 'Example' });
all(heading).find(node => node.type === 'h1').props.ref.current = { focus: options => focuses.push(options) };
headingHooks.flush();
assert.equal(focuses.length, 0);
params = new URLSearchParams('q=Example&type=movie');
headingHooks.render(SearchPageHeading, { query: 'Example' }); headingHooks.flush();
assert.equal(focuses.length, 0, 'Segment changes do not take keyboard focus from the control');
params = new URLSearchParams('q=Example&type=movie&page=2');
headingHooks.render(SearchPageHeading, { query: 'Example' }); headingHooks.flush();
assert.equal(focuses.length, 1, 'Pagination still restores heading focus and scroll');
params = new URLSearchParams('q=Example');
