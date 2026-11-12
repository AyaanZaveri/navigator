const assert = require('node:assert/strict');
const { load, hooks } = require('./test-support/react-hooks.cjs');
const host = hooks(), sent = [];
let listener, unsubscribed = 0, bridge;
const { AppUpdates } = load('components/settings/app-updates.tsx', {
    react: host.react, 'react/jsx-runtime': host.jsx,
    '@/lib/desktop/bridge': { desktopBridge: () => bridge },
    '@/components/ui/button': { Button: 'Button' }, '@/components/arc/switch/switch': { Switch: 'Switch' },
    '@/components/ui/field': { Field: 'Field', FieldContent: 'Content', FieldLabel: 'Label', FieldDescription: 'Description' },
    '@/package.json': { version: '0.3.6' }, '@/app/(main)/settings/settings.module.css': {},
});
function find(node, type) {
    if (Array.isArray(node)) return node.flatMap(child => find(child, type));
    if (!node || typeof node !== 'object') return [];
    return [...(node.type === type ? [node] : []), ...find(node.props?.children, type)];
}
let tree = host.render(AppUpdates); host.flush();
assert.equal(find(tree, 'Button').length, 0, 'Web exposes no native commands');
assert.equal(sent.length, 0);
bridge = { platform: 'windows', capabilities: { updates: true }, send: request => sent.push(request), subscribe: cb => { listener = cb; return () => unsubscribed++; } };
host.replay();
assert.equal(sent[0].type, 'update-status');
listener({ type: 'update-status', version: '0.3.6', available: true, automatic: true, state: 'idle' });
tree = host.render(AppUpdates); host.flush();
find(tree, 'Button')[0].props.onClick();
assert.equal(sent.at(-1).type, 'update-check');
find(tree, 'Switch')[0].props.onCheckedChange(false);
assert.equal(sent.at(-1).type, 'update-automatic'); assert.equal(sent.at(-1).enabled, false);
listener({ type: 'update-status', version: '0.3.6', available: true, automatic: false, state: 'checking' });
tree = host.render(AppUpdates);
assert.equal(find(tree, 'Button')[0].props.disabled, true);
assert.match(JSON.stringify(tree), /Checking/);
listener({ type: 'update-status', version: '0.3.6', available: false, automatic: false, state: 'error', message: 'Couldn’t check for updates.' });
tree = host.render(AppUpdates);
assert.equal(find(tree, 'Button').length, 0, 'Portable copies cannot install over another installation');
assert.match(JSON.stringify(tree), /Couldn’t check/);
host.unmount(); assert.equal(unsubscribed, 1);
console.log('PASS: update control capability gating, installed version, commands, preference, busy/error states and subscription cleanup.');
const header = hooks();
const { DesktopUpdateButton } = load('components/desktop-update-button.tsx', {
    react: header.react, 'react/jsx-runtime': header.jsx,
    'next/link': 'Link', 'lucide-react': { Download: 'Download' }, '@/components/ui/button': { Button: 'Button' },
    '@/lib/desktop/bridge': { desktopBridge: () => bridge },
    './app-header.module.css': { signIn: 'sign-in-material' },
});
header.render(DesktopUpdateButton); header.flush();
for (const state of ['idle', 'checking', 'current', 'error']) {
    listener({ type: 'update-status', version: '0.5.0', available: true, automatic: true, state });
    assert.equal(header.render(DesktopUpdateButton), null, `No header update action in ${state} state`);
}
listener({ type: 'update-status', version: '0.5.0', available: true, automatic: true, state: 'available' });
const headerTree = header.render(DesktopUpdateButton);
assert.equal(headerTree.props.children.props['aria-label'], 'Update available');
assert.equal(headerTree.props.children.props.href, '/settings/about', 'Guest users can reach the offered update');
assert.equal(headerTree.props.variant, 'outline', 'Use the sign-in button material');
assert.match(headerTree.props.className, /size-11/, 'Match the 44px search bar height and width');
assert.match(headerTree.props.className, /sign-in-material/);
listener({ type: 'update-status', version: '0.5.0', available: false, automatic: true, state: 'available' });
assert.equal(header.render(DesktopUpdateButton), null, 'Portable apps do not show an inoperative update action');
header.unmount();
console.log('PASS: header update action appears only for an offered update, uses the sign-in material and stays hidden for portable apps.');
