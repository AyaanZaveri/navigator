const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const state = [];
let stateIndex = 0;
const playback = [];
const context = { exports: {}, require(name) {
    if (name === '@/lib/preload-tools') return { preloadPlayer() {} };
    if (name === 'react') return { ...React, useState(initial) {
        const index = stateIndex++;
        if (!(index in state)) state[index] = initial;
        return [state[index], value => { state[index] = value; }];
    } };
    if (name === '@/lib/artwork') return { mediaArtwork: () => ({ poster: '/poster.jpg', background: '/backdrop.jpg' }) };
    if (name === '@/components/watched-indicator') return { WatchedIndicator: () => null };
    if (name === '@/lib/series-route') return { buildEpisodePath: () => '/series/fixture/1/1' };
    if (name === '@/contexts/MediaPlayerContext') return { useMediaPlayer: () => ({ playMedia: async item => playback.push(item), setIsPlayerVisible: visible => playback.push(visible) }) };
    if (name === 'next/link') return ({ children }) => children;
    if (name.endsWith('.module.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
    return require(name);
} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/media-card.tsx', 'utf8'), {
    fileName: 'components/media-card.tsx',
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText, context);
function render(continueWatching = false) {
    stateIndex = 0;
    return context.exports.MediaCard({ continueWatching, item: { id: 'tt123', name: 'Fixture', type: 'movie', resumePositionTicks: 30, streamUrl: 'https://example.test/movie.mp4' } });
}
assert.equal(render(true).props['data-continue-watching'], true, 'Resume cards opt into stable brightness styling');
assert.equal(render().props['data-continue-watching'], undefined, 'Regular posters retain normal hover styling');
function hasSeparateResumeShade(node) {
    if (!node || typeof node !== 'object') return false;
    if (node.props?.className?.includes('bg-black/35')) return true;
    return React.Children.toArray(node.props?.children).some(hasSeparateResumeShade);
}
assert.equal(hasSeparateResumeShade(render(true)), false, 'A separate shade must not be composited over the resume image');
const frame = () => render().props.children[0];
for (const end of ['onPointerLeave', 'onPointerCancel', 'onPointerUp']) {
    frame().props.onPointerDown({ button: 0 });
    assert.equal(frame().props['data-pressed'], true);
    frame().props[end]();
    assert.equal(frame().props['data-pressed'], undefined, end + ' must clear press feedback');
}
frame().props.onPointerDown({ button: 2 });
assert.equal(frame().props['data-pressed'], undefined, 'Secondary clicks must not scale the card');
function findButton(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'button') return node;
    let found;
    React.Children.forEach(node.props?.children, child => { found ||= findButton(child); });
    return found;
}
(async () => {
    let prevented = false, stopped = false;
    await findButton(render()).props.onClick({ preventDefault() { prevented = true; }, stopPropagation() { stopped = true; } });
    assert.equal(prevented && stopped, true);
    assert.equal(playback[0].streamUrl, 'https://example.test/movie.mp4');
    assert.equal(playback[0].resumePositionTicks, 30);
    assert.equal(playback[1], true);
    console.log('PASS: press scale resets on pointer leave, cancel and release; secondary clicks are ignored; playback remains intact.');
})();
