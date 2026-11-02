const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');

function transpile(file) {
    return ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        fileName: file,
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText;
}
function utility(file) {
    const context = { exports: {}, URL };
    vm.runInNewContext(transpile(file), context);
    return context.exports;
}
function find(tree, predicate) {
    if (!tree || typeof tree !== 'object') return [];
    return [...(predicate(tree) ? [tree] : []), ...React.Children.toArray(tree.props?.children).flatMap(child => find(child, predicate))];
}
class Media extends EventTarget {
    error = null;
    currentTime = 0;
    duration = 600;
    play() { return Promise.resolve(); }
}
function harness({ native = false, automatic = false } = {}) {
    const source = 'https://stream.example/Buddy.2160p.mkv';
    let request = { id: 'buddy', type: 'movie', name: 'Buddy', resumePositionTicks: 42, ...(automatic ? {} : { streamUrl: source }) };
    let visible = true, dirty = true, index = 0, tree, renderedVideo, media, timerId = 0, streamFetches = 0;
    const slots = [], effects = [], timers = new Map(), events = [];
    const noOp = () => {};
    const equal = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
    const hooks = {
        ...React,
        useState(initial) {
            const i = index++;
            slots[i] ??= { value: typeof initial === 'function' ? initial() : initial };
            return [slots[i].value, update => {
                const value = typeof update === 'function' ? update(slots[i].value) : update;
                if (!Object.is(slots[i].value, value)) { slots[i].value = value; dirty = true; }
            }];
        },
        useRef(initial) { return (slots[index++] ??= { current: initial }); },
        useMemo(create, deps) {
            const i = index++;
            if (!slots[i] || !equal(slots[i].deps, deps)) slots[i] = { value: create(), deps };
            return slots[i].value;
        },
        useCallback(callback, deps) { return hooks.useMemo(() => callback, deps); },
        useEffect(create, deps) {
            const i = index++;
            if (slots[i] && equal(slots[i].deps, deps)) return;
            effects.push(() => { slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: create() }; });
        },
    };
    hooks.useLayoutEffect = hooks.useEffect;
    const context = { exports: {}, console: { warn() {}, error() {} },
        setTimeout(callback, delay) { timers.set(++timerId, { callback, delay }); return timerId; },
        clearTimeout(id) { timers.delete(id); },
        document: { documentElement: { dataset: {} }, addEventListener: noOp, removeEventListener: noOp,
            dispatchEvent(event) { events.push(event.detail); } },
        CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
        require(name) {
            if (name === 'react') return hooks;
            if (name.endsWith('.css')) return {};
            if (name === '@/contexts/MediaPlayerContext') return { useMediaPlayer: () => ({
                currentMedia: request, isPlayerVisible: visible, skipTimestamp: null,
                setIsPlayerVisible(value) { visible = value; dirty = true; },
                setCurrentMediaWithSource: noOp, setCurrentTimestamp: noOp,
            }) };
            if (name === '@/contexts/settings-context') return { useSettings: () => ({}) };
            if (name === '@/lib/desktop/bridge') return { desktopBridge: () => native ? {} : null };
            if (name === '@/lib/media/playback-source') return utility('lib/media/playback-source.ts');
            if (name === '@/lib/media/resolve-playback') return utility('lib/media/resolve-playback.ts');
            if (name === '@/lib/media/playback-titles') return utility('lib/media/playback-titles.ts');
            if (name === '@/lib/media/fetch-playback-streams') return { async fetchPlaybackStreams() { streamFetches++; return [{ url: source }]; } };
            if (name === '@/app/actions') return { fetchMediaDetails: async () => null, reportPlaybackStart: noOp, reportPlaybackProgress: noOp, reportPlaybackStopped: noOp };
            if (name === '@/app/actions/utils') return { getSubtitleTracks: async () => [] };
            if (name.startsWith('@/') || name === '@mux/mux-video-react') return new Proxy({}, { get: () => noOp });
            return require(name);
        },
    };
    vm.runInNewContext(transpile('components/global-media-player.tsx'), context);
    function render() {
        index = 0; dirty = false;
        tree = context.exports.GlobalMediaPlayer({});
        const video = find(tree, node => node.props?.src && node.props.onError && node.props.onLoadedMetadata)[0];
        if (video) {
            if (!renderedVideo || renderedVideo.key !== video.key) media = new Media();
            video.props.ref.current = media;
        } else if (renderedVideo) renderedVideo.props.ref.current = null;
        renderedVideo = video;
        while (effects.length) effects.shift()();
    }
    return {
        source, timers, events,
        get video() { return renderedVideo; },
        get media() { return media; },
        get streamFetches() { return streamFetches; },
        get errorVisible() { return find(tree, node => node.props?.role === 'alert').length > 0; },
        async settle() { for (let i = 0; i < 20; i++) { if (dirty) render(); await Promise.resolve(); } },
        fail(code = 4) {
            media.error = { code, message: 'MEDIA_ELEMENT_ERROR: Format error' };
            renderedVideo.props.onError({ currentTarget: media, target: media });
        },
        playing() {
            media.error = null;
            renderedVideo.props.onPlaying({ currentTarget: media, target: media });
        },
        runTimer() {
            assert.equal(timers.size, 1, 'Exactly one startup retry is scheduled');
            const [id, timer] = timers.entries().next().value;
            timers.delete(id); timer.callback();
        },
        close() { find(tree, node => node.props?.['data-player-close'] !== undefined)[0].props.onClick(); },
        retry() { find(tree, node => node.props?.children === 'Try again')[0].props.onClick(); },
        replace() { request = { ...request, id: 'another-movie', streamUrl: 'https://stream.example/another.mp4' }; dirty = true; },
    };
}

async function run() {
    for (const automatic of [false, true]) {
        const player = harness({ automatic });
        await player.settle();
        const original = player.video;
        player.fail(); player.fail();
        await player.settle();
        assert.equal(player.errorVisible, false, 'A recoverable startup failure should retry before showing a fatal error');
        player.runTimer(); await player.settle();
        assert.notEqual(player.video.key, original.key, 'Recovery must mount a fresh decoder');
        assert.equal(player.video.props.src, player.source, 'Recovery must keep the exact same 4K source');
        player.playing(); await player.settle();
        assert.equal(player.errorVisible, false);
        assert.equal(player.timers.size, 0);
        assert.equal(player.streamFetches, automatic ? 1 : 0, 'Recovery must not refetch or select a lower-quality source');
        player.fail(3); await player.settle();
        assert.equal(player.errorVisible, true, 'Failures during established playback must not restart the movie from the beginning');
        assert.equal(player.timers.size, 0);
    }

    const permanent = harness(); await permanent.settle();
    for (let attempt = 0; attempt < 2; attempt++) {
        permanent.fail(); await permanent.settle();
        permanent.runTimer(); await permanent.settle();
    }
    permanent.fail(); await permanent.settle();
    assert.equal(permanent.errorVisible, true, 'A genuinely unsupported file must stop after bounded retries');
    assert.equal(permanent.timers.size, 0);
    permanent.retry(); await permanent.settle();
    assert.equal(permanent.errorVisible, false);
    permanent.fail(); await permanent.settle();
    permanent.runTimer(); await permanent.settle();

    const closed = harness(); await closed.settle();
    closed.fail(); await closed.settle(); closed.close(); await closed.settle();
    assert.equal(closed.timers.size, 0, 'Closing playback cancels recovery');

    const switched = harness(); await switched.settle();
    const stale = switched.video, staleMedia = switched.media;
    switched.fail(); await switched.settle(); switched.replace(); await switched.settle();
    stale.props.onError({ currentTarget: staleMedia, target: staleMedia }); await switched.settle();
    assert.equal(switched.timers.size, 0, 'Old sources cannot schedule recovery for a new source');
    assert.equal(switched.errorVisible, false, 'Old decoder errors cannot cover a new source');

    const native = harness({ native: true }); await native.settle();
    native.fail(); await native.settle();
    assert.equal(native.errorVisible, true, 'Desktop native playback keeps its existing error handling');
    assert.equal(native.timers.size, 0);
    console.log('PASS: actual player retries startup failures with the same source, deduplicates errors, bounds recovery, and ignores stale decoder errors.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
