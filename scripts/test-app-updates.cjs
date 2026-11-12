const assert = require('node:assert/strict');
const { load, hooks } = require('./test-support/react-hooks.cjs');
function find(node, type) {
    if (Array.isArray(node)) return node.flatMap(child => find(child, type));
    if (!node || typeof node !== 'object') return [];
    return [...(node.type === type ? [node] : []), ...find(node.props?.children, type)];
}
for (const platform of ['windows', 'macos']) {
    const host = hooks(), sent = [];
    let listener, unsubscribed = 0, bridge;
    const { AppUpdates } = load('components/settings/app-updates.tsx', {
        react: host.react, 'react/jsx-runtime': host.jsx,
        '@/lib/desktop/bridge': { desktopBridge: () => bridge },
        '@/components/ui/button': { Button: 'Button' }, '@/components/github-icon': { GitHubIcon: 'GitHubIcon' },
        '@/components/arc/switch/switch': { Switch: 'Switch' },
        '@/components/ui/field': { Field: 'Field', FieldContent: 'Content', FieldLabel: 'Label', FieldDescription: 'Description' },
        '@/package.json': { version: '0.5.2' }, '@/app/(main)/settings/settings.module.css': {},
    });
    let tree = host.render(AppUpdates); host.flush();
    const github = find(tree, 'Button')[0];
    assert.equal(github.props.variant, 'ghost');
    assert.equal(github.props.size, 'sm');
    assert.equal(github.props.className, '-ml-2.5');
    assert.equal(find(github, 'a')[0].props.href, 'https://github.com/AyaanZaveri/navigator/releases');
    assert.equal(find(github, 'GitHubIcon').length, 1);
    assert.equal(find(tree, 'Switch').length, 0);
    assert.doesNotMatch(JSON.stringify(tree), /In-app|Windows|macOS|Check for updates|update-status/, 'Web shows no desktop update promotion or native controls');
    assert.equal(sent.length, 0);
    bridge = { platform, capabilities: { updates: true }, send: request => sent.push(request), subscribe: cb => { listener = cb; return () => unsubscribed++; } };
    host.replay();
    assert.equal(sent[0].type, 'update-status');
    listener({ type: 'update-status', version: '0.5.2', available: true, automatic: true, state: 'idle' });
    tree = host.render(AppUpdates); host.flush();
    find(tree, 'Button').find(button => button.props.onClick).props.onClick();
    assert.equal(sent.at(-1).type, 'update-check');
    find(tree, 'Switch')[0].props.onCheckedChange(false);
    assert.equal(sent.at(-1).type, 'update-automatic'); assert.equal(sent.at(-1).enabled, false);
    listener({ type: 'update-status', version: '0.5.2', available: true, automatic: false, state: 'checking' });
    tree = host.render(AppUpdates);
    assert.equal(find(tree, 'Button').find(button => button.props.onClick).props.disabled, true);
    listener({ type: 'update-status', version: '0.5.2', available: false, automatic: false, state: 'error', message: 'Couldn’t check for updates.' });
    tree = host.render(AppUpdates);
    assert.equal(find(tree, 'Button').filter(button => button.props.onClick).length, 0);
    assert.match(JSON.stringify(tree), /Couldn’t check/);
    host.unmount(); assert.equal(unsubscribed, 1);
    const header = hooks();
    const { DesktopUpdateButton } = load('components/desktop-update-button.tsx', {
        react: header.react, 'react/jsx-runtime': header.jsx,
        'next/link': 'Link', 'lucide-react': { Download: 'Download' }, '@/components/ui/button': { Button: 'Button' },
        '@/lib/desktop/bridge': { desktopBridge: () => bridge }, './app-header.module.css': { signIn: 'sign-in-material' },
    });
    header.render(DesktopUpdateButton); header.flush();
    for (const state of ['idle', 'checking', 'current', 'error']) {
        listener({ type: 'update-status', version: '0.5.2', available: true, automatic: true, state });
        assert.equal(header.render(DesktopUpdateButton), null);
    }
    listener({ type: 'update-status', version: '0.5.2', available: true, automatic: true, state: 'available' });
    const indicator = header.render(DesktopUpdateButton);
    assert.equal(indicator.props.children.props.href, '/settings/about');
    assert.equal(indicator.props.variant, 'outline');
    assert.match(indicator.props.className, /size-11/);
    assert.match(indicator.props.className, /sign-in-material/);
    listener({ type: 'update-status', version: '0.5.2', available: false, automatic: true, state: 'available' });
    assert.equal(header.render(DesktopUpdateButton), null);
    header.unmount();
    console.log(`PASS: ${platform} update commands, preference, statuses, cleanup and offered-update indicator; web-only version/GitHub button.`);
}
