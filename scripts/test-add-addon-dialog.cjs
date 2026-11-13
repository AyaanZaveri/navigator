const assert = require('node:assert/strict');
const { load, hooks } = require('./test-support/react-hooks.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const nodes = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];

async function main() {
    const h = hooks();
    const timers = new Map();
    const lookups = [];
    let timerId = 0;
    let installs = 0;
    const components = names => Object.fromEntries(names.map(name => [name, name]));
    const { AddAddonDialog } = load('components/add-addon-dialog.tsx', {
        react: { ...h.react, useId: () => 'test-addon', useTransition: () => [false, work => { void work(); }] },
        'react/jsx-runtime': h.jsx,
        'next/navigation': { useRouter: () => ({ refresh() {} }) },
        'next/image': { default: 'img' },
        'lucide-react': components(['ArrowUpRight', 'ExternalLink', 'Link2', 'Loader2', 'Plus', 'Puzzle']),
        sonner: { toast: { success() {} } },
        '@/app/actions/addons': {
            previewAddon: link => new Promise(resolve => lookups.push({ link, resolve })),
            installAddon: async () => { installs++; return { error: null }; },
        },
        '@/components/account-ui/dialog': components(['Dialog', 'DialogContent', 'DialogDescription', 'DialogHeader', 'DialogTitle']),
        '@/components/ui/button': components(['Button']),
        '@/components/ui/input-group': components(['InputGroup', 'InputGroupInput', 'InputGroupAddon']),
        '@/components/ui/field': components(['Field', 'FieldDescription', 'FieldError', 'FieldGroup', 'FieldLabel']),
        '@/components/ui/avatar': components(['Avatar', 'AvatarFallback', 'AvatarImage']),
        '@/components/ui/badge': components(['Badge']),
        '@/lib/addons': { ADDON_CAPABILITIES: [] },
        '@/components/account-ui/surface.module.css': { surface: 'surface' },
        './browse-addon-link.module.css': { link: 'browse-link', arrow: 'browse-arrow' },
    }, {
        URL,
        setTimeout: (work, delay) => { assert.equal(delay, 600); timers.set(++timerId, work); return timerId; },
        clearTimeout: id => timers.delete(id),
    });
    const render = () => { h.render(AddAddonDialog); h.flush(); return h.render(AddAddonDialog); };
    const find = type => nodes(render()).find(node => node.type === type);
    const change = value => { find('InputGroupInput').props.onChange({ target: { value } }); render(); };
    const runTimers = () => { const work = [...timers.values()]; timers.clear(); work.forEach(run => run()); };
    const result = (name, logo) => ({ addon: { id: name, name, logo, version: '1', capabilities: [] }, configureUrl: null, configurationRequired: false, error: null });

    find('Button').props.onClick(); render();
    assert.ok(find('Link2'), 'The empty input uses the link icon');
    change('https://example.com/mani');
    assert.equal(timers.size, 0, 'Incomplete links do not trigger network lookups');
    change('https://example.com/manifest.json');
    assert.equal(lookups.length, 0, 'Typing schedules a lookup without fetching immediately');
    change('https://example.com/config/manifest.json');
    assert.equal(timers.size, 1, 'Typing again replaces the debounce timer');
    runTimers(); render();
    assert.equal(lookups.length, 1);
    assert.equal(lookups[0].link, 'https://example.com/config/manifest.json');
    assert.ok(find('Loader2'), 'Loading has visible feedback');
    change('stremio://example.com/new/manifest.json');
    runTimers(); render();
    lookups[0].resolve(result('Old addon', 'https://example.com/old.png')); await tick();
    assert.equal(find('AvatarImage'), undefined, 'An older lookup cannot show the wrong addon icon');
    lookups[1].resolve(result('New addon', 'https://example.com/new.png')); await tick();
    assert.equal(find('AvatarImage').props.src, 'https://example.com/new.png');
    assert.equal(installs, 0, 'Automatic review never installs an addon');
    assert.ok(nodes(render()).some(node => node.type === 'a' && node.props.href === 'https://stremio-addons.net/'));

    change('https://example.com/last/manifest.json'); runTimers(); render();
    find('Dialog').props.onOpenChange(false); render();
    lookups[2].resolve(result('Closed addon', 'https://example.com/closed.png')); await tick();
    assert.equal(find('AvatarImage'), undefined, 'Closing cancels delivery of an in-flight icon lookup');
    assert.equal(find('InputGroupInput').props.value, '');
    find('Button').props.onClick(); render();
    change('https://example.com/manual/manifest.json');
    find('form').props.onSubmit({ preventDefault() {} });
    runTimers();
    assert.equal(lookups.length, 4, 'Manual review supersedes the pending automatic lookup');
    lookups[3].resolve(result('Manual addon')); await tick();
    assert.ok(find('Puzzle'), 'An addon without a logo gets a stable fallback icon');
    h.unmount();
    console.log('PASS: debounced addon lookup, icon loading/fallback, stale result protection, cancel, directory link, and explicit install boundary');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
