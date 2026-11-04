const assert = require('node:assert/strict');
const { load, hooks } = require('./test-support/react-hooks.cjs');

async function main() {
    const navigation = load('lib/settings-navigation.ts');
    assert.deepEqual(Array.from(navigation.SETTINGS_CATEGORIES, item => item.id), ['playback', 'subtitles', 'navigator', 'connections']);
    assert.equal(navigation.isSettingsCategory('unknown'), false);
    assert.equal(navigation.settingsCategoryFromPath('/settings/connections'), 'connections');

    const host = hooks();
    let reducedMotion = false;
    let pathname = '/settings/playback';
    const pushed = [], scrolls = [], focuses = [];
    const document = { title: '', querySelector: selector => {
        assert.equal(selector, '[data-page-scroll]', 'Scroll the real app viewport, not the window');
        return { scrollTo: options => scrolls.push(options) };
    } };
    const { SettingsShell } = load('components/settings/settings-shell.tsx', {
        react: { ...host.react, useId: () => 'settings-test' }, 'react/jsx-runtime': host.jsx,
        'motion/react': { LayoutGroup: 'LayoutGroup', motion: { span: 'Selection' }, useReducedMotion: () => reducedMotion },
        '@/components/arc/lib/motion-tokens': load('components/arc/motion-tokens.ts'),
        'next/link': 'Link', 'next/navigation': { usePathname: () => pathname, useRouter: () => ({ push: value => pushed.push(value) }) },
        '@/components/ui/button': { Button: 'Button' },
        '@/components/arc/select/select': { Select: 'Select' },
        '@/components/home-gradient-background': { HomeGradientBackground: 'Backdrop' },
        '@/lib/settings-navigation': navigation,
        '@/app/(main)/settings/settings.module.css': {},
    }, { document });
    function find(node, predicate) {
        if (Array.isArray(node)) return node.flatMap(child => find(child, predicate));
        if (!node || typeof node !== 'object') return [];
        return [...(predicate(node) ? [node] : []), ...find(node.props?.children, predicate)];
    }
    let tree = host.render(SettingsShell, { children: 'settings body' });
    const title = find(tree, node => node.type === 'h1')[0];
    title.props.ref.current = { focus: options => focuses.push(options) };
    host.flush();
    assert.equal(document.title, 'Playback settings · Navigator');
    assert.equal(focuses.length, 0, 'Initial load does not steal focus');
    let links = find(tree, node => node.type === 'Link');
    assert.equal(links.length, 4);
    assert.equal(links.filter(link => link.props['aria-current'] === 'page').length, 1);
    assert.equal(links.find(link => link.props['aria-current']).props.href, '/settings/playback');
    const selection = find(tree, node => node.type === 'Selection')[0];
    assert.equal(find(tree, node => node.type === 'Selection').length, 1, 'One selection layer travels between the links');
    assert.equal(selection.props.initial, false, 'Initial load does not animate the highlight in');
    assert.equal(selection.props['aria-hidden'], 'true', 'The decorative layer does not change link names');
    assert.equal(selection.props.transition.bounce, 0);
    const selector = find(tree, node => node.type === 'Select')[0];
    selector.props.onValueChange('subtitles');
    assert.deepEqual(pushed, ['/settings/subtitles']);
    pathname = '/settings/subtitles';
    tree = host.render(SettingsShell, { children: 'subtitle body' }); host.flush();
    assert.equal(document.title, 'Subtitles settings · Navigator');
    assert.equal(find(tree, node => node.type === 'h1')[0].props.children, 'Subtitles');
    assert.equal(find(tree, node => node.type === 'Selection')[0].props.layoutId, selection.props.layoutId, 'Route changes preserve shared selection identity');
    assert.equal(find(tree, node => node.type === 'Selection')[0].props.layoutDependency, 'subtitles');
    assert.equal(scrolls.length, 1);
    assert.equal(focuses.length, 1, 'Client category changes focus the new heading');
    assert.equal(focuses[0].preventScroll, true);
    pathname = '/settings/playback';
    tree = host.render(SettingsShell, { children: 'back' }); host.flush();
    assert.equal(find(tree, node => node.type === 'Link' && node.props['aria-current'] === 'page')[0].props.href, '/settings/playback', 'Back navigation restores selected state');

    find(tree, node => node.type === 'nav')[0].props.onKeyDownCapture();
    tree = host.render(SettingsShell, { children: 'keyboard' });
    assert.equal(find(tree, node => node.type === 'Selection')[0].props.transition.duration, 0, 'Keyboard navigation updates immediately');
    find(tree, node => node.type === 'nav')[0].props.onPointerDownCapture();
    tree = host.render(SettingsShell, { children: 'pointer' });
    assert.equal(find(tree, node => node.type === 'Selection')[0].props.transition.type, 'spring', 'Pointer navigation restores the sliding highlight');
    reducedMotion = true;
    tree = host.render(SettingsShell, { children: 'reduced motion' });
    assert.equal(find(tree, node => node.type === 'Selection')[0].props.transition.duration, 0, 'Reduced motion never moves the highlight');

    const index = load('app/(main)/settings/page.tsx', { 'next/navigation': { redirect: href => { throw new Error(href); } } });
    assert.throws(() => index.default(), /\/settings\/playback/);
    const categoryPage = load('app/(main)/settings/[category]/page.tsx', {
        'react/jsx-runtime': host.jsx, 'next/navigation': { notFound: () => { throw new Error('404'); } },
        '@/components/settings/settings-view': { SettingsView: 'SettingsView' }, '@/lib/settings-navigation': navigation,
    });
    for (const item of navigation.SETTINGS_CATEGORIES) {
        const rendered = await categoryPage.default({ params: Promise.resolve({ category: item.id }) });
        assert.equal(rendered.props.category, item.id);
    }
    await assert.rejects(categoryPage.default({ params: Promise.resolve({ category: 'unknown' }) }), /404/);
    console.log('PASS: settings category routes, links, mobile selection, Back navigation, heading focus, scroll container and unknown-route handling.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
