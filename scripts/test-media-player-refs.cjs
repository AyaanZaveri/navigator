const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const ast = ts.createSourceFile('player.tsx', fs.readFileSync('components/ui/media-player.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = new Set(['MediaPlayerVideo', 'MediaPlayerAudio']);
const wrappers = ast.statements.filter(node => names.has(node.name?.getText(ast))).map(node => node.getText(ast));
assert.equal(wrappers.length, 2);
const React = { useCallback: fn => fn };
const refs = { exports: {}, require: () => React };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/compose-refs.ts', 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, refs);

for (const kind of ['Video', 'Audio']) for (const asChild of [false, true]) for (const callbackRef of [false, true]) {
    const shared = { current: null }, objectRef = { current: null }, forwarded = [], registered = [];
    let cleanups = 0;
    const context = { exports: {}, React,
        useComposedRefs: refs.exports.useComposedRefs,
        useMediaPlayerContext: () => ({ mediaRef: shared, mediaId: 'test', labelId: 'label', descriptionId: 'description' }),
        useMediaRef: () => element => { assert.equal(shared.current, element); registered.push(element); },
        useMediaDispatch: () => () => {}, MediaActionTypes: {}, Slot: 'slot',
        require: () => ({ jsx: (type, props) => ({ type, props }) }),
    };
    vm.runInNewContext(ts.transpileModule(wrappers.join('\n') + `\nexports.Component = MediaPlayer${kind};`, {
        fileName: 'wrappers.tsx', compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText, context);
    const ref = callbackRef ? element => { forwarded.push(element); return () => { cleanups++; }; } : objectRef;
    const tree = context.exports.Component({ ref, asChild, src: 'https://example.test/media' });
    const element = { tagName: asChild ? 'MUX-VIDEO' : kind.toUpperCase() };
    const cleanup = tree.props.ref(element);
    assert.equal(shared.current, element);
    assert.equal(registered.at(-1), element, 'Register the actual media element, not a copied adapter');
    if (callbackRef) assert.equal(forwarded.at(-1), element);
    else assert.equal(objectRef.current, element);
    if (cleanup) cleanup(); else tree.props.ref(null);
    assert.equal(shared.current, null);
    assert.equal(registered.at(-1), null, 'Detach the store and shared refs on unmount');
    if (callbackRef) assert.equal(cleanups, 1, 'Preserve React 19 forwarded-ref cleanup');
    else assert.equal(objectRef.current, null);
}
console.log('PASS: video/audio refs forward native/custom elements, detach shared/store refs, and preserve React 19 cleanup.');
