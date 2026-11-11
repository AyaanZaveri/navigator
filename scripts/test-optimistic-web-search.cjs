const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { load, hooks } = require('./test-support/react-hooks.cjs');
const { createOptimisticToggle } = load('lib/optimistic-toggle.ts');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function nodes(node) {
    if (Array.isArray(node)) return node.flatMap(nodes);
    if (!node || typeof node !== 'object') return [];
    return [node, ...nodes(node.props?.children)];
}

(async () => {
    let value = true;
    const writes = [];
    const queue = createOptimisticToggle({
        read: () => value, update: next => { value = next; }, failed() { throw Error('Unexpected failure'); },
        save: next => { const work = deferred(); writes.push({ next, ...work }); return work.promise; },
    });
    queue.set(false); queue.set(true);
    assert.equal(writes.length, 1);
    writes[0].resolve(false); await tick();
    assert.equal(value, true, 'An older successful write must not flash the older value');
    assert.equal(writes.length, 2, 'Persist the latest reversed choice after the first write');
    assert.equal(writes[1].next, true);
    writes[1].resolve(true); await tick();
    assert.equal(queue.isPending(), false);
    queue.dispose();

    const source = fs.readFileSync('components/settings/settings-view.tsx', 'utf8');
    const ast = ts.createSourceFile('settings.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'WebSearchSettings');
    const host = hooks(), requests = [], reads = [], events = new Map();
    const context = { exports: {}, ...host.react, createOptimisticToggle,
        require: name => name === 'react/jsx-runtime' ? host.jsx : require(name),
        useConnectionCredential: () => ({ value: '', setValue() {}, persist() {} }),
        getWebSearchSettings() { const work = deferred(); reads.push(work); return work.promise; },
        setWebSearchEnabled(value) { const work = deferred(); requests.push({ value, ...work }); return work.promise; },
        CONNECTION_CREDENTIALS_EVENT: 'credentials',
        window: { addEventListener: (event, handler) => events.set(event, handler), removeEventListener: event => events.delete(event) },
        styles: {}, Field: 'field', FieldContent: 'content', FieldLabel: 'label', TinyFishIcon: 'icon', Switch: 'switch', Link: 'link',
    };
    vm.runInNewContext(ts.transpileModule(`${component.getText(ast)}\nexports.Component = WebSearchSettings;`, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText, context);
    const render = () => host.render(context.exports.Component, { variant: 'preference' });
    const control = () => nodes(render()).find(node => node.type === 'switch');
    render(); host.flush();
    reads[0].resolve({ configured: true, personal: true, enabled: true }); await tick();
    assert.equal(control().props.checked, true);
    events.get('credentials')(); // Hold an old read across a newer click.
    control().props.onCheckedChange(false);
    assert.equal(control().props.checked, false, 'Switch must change before a held save resolves');
    assert.equal(control().props.disabled, false, 'Switch remains interactive during persistence');
    control().props.onCheckedChange(true);
    control().props.onCheckedChange(false);
    assert.equal(requests.length, 1, 'Only one cookie write may be in flight');
    reads[1].resolve({ configured: true, personal: true, enabled: true }); await tick();
    assert.equal(control().props.checked, false, 'An old settings read cannot override pending intent');
    requests[0].resolve({ success: true, enabled: false }); await tick();
    assert.equal(requests.length, 1, 'Rapid reversals coalesce into the confirmed final value');

    control().props.onCheckedChange(true);
    requests[1].resolve({ success: false, error: 'Could not save' }); await tick();
    assert.equal(control().props.checked, false, 'Latest failure restores confirmed preference');
    assert.ok(nodes(render()).some(node => node.props?.role === 'alert'));

    control().props.onCheckedChange(true);
    control().props.onCheckedChange(false);
    requests[2].reject(Error('Old failure')); await tick();
    assert.equal(control().props.checked, false);
    assert.ok(!nodes(render()).some(node => node.props?.role === 'alert'), 'An obsolete failure must not replace current feedback');

    control().props.onCheckedChange(true);
    events.get('credentials')();
    requests[3].resolve({ success: true, enabled: true }); await tick();
    reads[2].resolve({ configured: true, personal: true, enabled: false }); await tick();
    assert.equal(control().props.checked, true, 'Reads started during a write stay stale after it finishes');

    control().props.onCheckedChange(false);
    const beforeUnmount = host.updates;
    host.unmount(); requests[4].resolve({ success: true, enabled: false }); await tick();
    assert.equal(host.updates, beforeUnmount, 'A late write cannot update an unmounted preference');
    assert.equal(events.size, 0);
    console.log('PASS: immediate enabled web-search switch, serialized/coalesced writes, rollback, stale-read/failure protection and disposal');
})().catch(error => { console.error(error); process.exitCode = 1; });
