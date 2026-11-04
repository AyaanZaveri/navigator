const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function languageRequire(name) {
    if (name !== '@/lib/media/audio-language') return require(name);
    const context = { exports: {}, require: languageRequire };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/media/audio-language.ts', 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText, context);
    return context.exports;
}

const React = require('react');

function transpile(file) {
    return ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        fileName: file,
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText;
}
function utility(file) {
    const context = { exports: {}, URL, require: languageRequire };
    vm.runInNewContext(transpile(file), context);
    return context.exports;
}
function find(tree, predicate) {
    if (!tree || typeof tree !== 'object') return [];
    return [...(predicate(tree) ? [tree] : []), ...React.Children.toArray(tree.props?.children).flatMap(child => find(child, predicate))];
}
class Media extends EventTarget {
    closest() { return null; }
    error = null;
    currentTime = 0;
    duration = 600;
    play() { return Promise.resolve(); }
}
function harness({ native = false, automatic = false, streams: customStreams } = {}) {
    const source = 'https://stream.example/Buddy.2160p.mkv';
    let request = { id: 'buddy', type: 'movie', name: 'Buddy', detailsPath: '/movie/buddy', navigatorActionId: 'test-playback-ack', resumePositionTicks: 42, ...(automatic ? {} : { streamUrl: source }) };
    let visible = true, dirty = true, index = 0, tree, renderedVideo, media, timerId = 0, streamFetches = 0, wallTime = 0;
    const slots = [], effects = [], timers = new Map(), events = [], toasts = [], published = [], routes = [];
    const streams = customStreams || [{ url: source, title: '2160p HEVC DTS REMUX' },
        { url: 'https://stream.example/best.mp4', title: '1080p H264 AAC' },
        { url: 'https://stream.example/next.mp4', title: '720p H264 AAC' }];
    const toast = (message, options) => toasts.push({ message, ...options });
    toast.error = toast; toast.dismiss = noOpToast;
    function noOpToast() {}
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
    const context = { exports: {}, AbortController, Date: class extends Date { static now() { return wallTime; } }, console: { warn() {}, error() {} },
        setTimeout(callback, delay) { timers.set(++timerId, { callback, delay }); return timerId; },
        clearTimeout(id) { timers.delete(id); },
        document: { documentElement: { dataset: {} }, addEventListener: noOp, removeEventListener: noOp,
            dispatchEvent(event) { events.push(event.detail); } },
        CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
        require(name) {
            if (name === 'next/navigation') return { useRouter: () => ({ push(path, options) {
                assert.ok(find(tree, node => node.props?.['data-player-shell'] !== undefined).length, 'Navigation must wait for the opaque player shell to commit');
                routes.push({ path, options });
            } }) };
            if (name === 'react') return hooks;
            if (name === 'sonner') return { toast };
            if (name.endsWith('.css')) return {};
            if (name === '@/contexts/MediaPlayerContext') return { useMediaPlayer: () => ({
                currentMedia: request, isPlayerVisible: visible, skipTimestamp: null,
                setIsPlayerVisible(value) { visible = value; dirty = true; },
                setCurrentMediaWithSource: value => published.push(value), setCurrentTimestamp: noOp,
            }) };
            if (name === '@/contexts/settings-context') return { useSettings: () => ({}) };
            if (name === '@/lib/media/subtitle-timing') return { useSubtitleTiming: () => ({ key: null, seconds: 0, onChange: noOp }), subtitleTime: time => time };
            if (name === '@/lib/desktop/bridge') return { desktopBridge: () => native ? {} : null, recordDesktopStage() {} };
            if (name === '@/lib/media/playback-source') return utility('lib/media/playback-source.ts');
            if (name === '@/lib/media/resolve-playback') return utility('lib/media/resolve-playback.ts');
            if (name === '@/lib/media/playback-details') return require('./test-support/playback-context.cjs').details;
            if (name === '@/lib/media/playback-titles') return utility('lib/media/playback-titles.ts');
            if (name === '@/lib/media/fetch-playback-streams') return { async fetchPlaybackStreams() { streamFetches++; return streams; } };
            if (name === '@/lib/media/fetch-playback-details') return { fetchPlaybackDetails: async () => null };
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
        source, timers, events, toasts, published, routes,
        get video() { return renderedVideo; },
        get media() { return media; },
        get streamFetches() { return streamFetches; },
        get errorVisible() { return find(tree, node => node.props?.role === 'alert').length > 0; },
        async settle() { for (let i = 0; i < 20; i++) { if (dirty) render(); await Promise.resolve(); } },
        fail(code = 4) {
            media.error = { code, message: 'MEDIA_ELEMENT_ERROR: Format error' };
            renderedVideo.props.onError({ currentTarget: media, target: media });
        },
        advance(seconds) { wallTime += seconds * 1000; media.currentTime += seconds; renderedVideo.props.onTimeUpdate(); },
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
        assert.equal(player.routes[0].path, '/movie/buddy');
        assert.equal(player.routes[0].options.scroll, false);
        assert.equal(player.video.props.src, automatic ? 'https://stream.example/best.mp4' : player.source);
        const original = player.video;
        player.fail(); player.fail();
        await player.settle();
        assert.equal(player.errorVisible, false, 'A failed source must advance before showing a fatal error');
        assert.notEqual(player.video.key, original.key, 'Fallback must mount a new source');
        assert.equal(player.video.props.src, automatic ? 'https://stream.example/next.mp4' : 'https://stream.example/best.mp4');
        assert.equal(player.toasts.length, 1, 'Duplicate decoder errors must show one recovery toast');
        assert.match(player.toasts[0].message, /Trying another one/);
        player.video.props.onLoadedMetadata();
        assert.equal(player.media.currentTime, 42, 'Scene/resume position must survive switching files');
        player.playing(); await player.settle();
        player.media.currentTime = 123;
        player.fail(3); await player.settle();
        player.video.props.onLoadedMetadata();
        assert.equal(player.media.currentTime, 123, 'Errors after playback starts must resume the next file at the current position');
        assert.equal(player.streamFetches, 1, 'Fallback must reuse discovered candidates instead of fetching them repeatedly');
        assert.equal(player.routes.length, 1, 'Stream fallback must not navigate again');
        assert.equal(player.errorVisible, false);
        assert.equal(player.timers.size, 0, 'Web recovery must not waste time retrying the same failed file');
    }

    const silent = harness({ automatic: true }); await silent.settle();
    silent.media.webkitVideoDecodedByteCount = 20000;
    silent.media.webkitAudioDecodedByteCount = 0;
    silent.media.volume = 1;
    silent.media.paused = false;
    silent.playing(); await silent.settle();
    assert.equal(silent.events.some(event => event.state === 'playing'), false, 'Silent video must not tell Navigator that playback succeeded');
    silent.advance(4); await silent.settle();
    assert.equal(silent.video.props.src, 'https://stream.example/next.mp4', 'Video decoding without supported audio must also try another file');
    assert.match(silent.toasts.at(-1).message, /no supported audio/);
    const audible = harness({ automatic: true }); await audible.settle();
    audible.media.webkitVideoDecodedByteCount = 20000;
    audible.media.webkitAudioDecodedByteCount = 4000;
    audible.media.volume = 1;
    audible.media.paused = false;
    audible.playing(); await audible.settle(); audible.advance(4); await audible.settle();
    assert.ok(audible.events.some(event => event.state === 'playing'), 'Decoded audio confirms successful playback');
    assert.equal(audible.video.props.src, 'https://stream.example/best.mp4', 'Confirmed audio and video must not trigger a fallback');
    assert.equal(audible.toasts.length, 0);

    const permanent = harness({ streams: [{ url: 'https://stream.example/Buddy.2160p.mkv' }] });
    await permanent.settle();
    permanent.fail(); await permanent.settle();
    assert.equal(permanent.errorVisible, true, 'Exhausting unique streams must stop with a useful error');
    assert.match(permanent.toasts.at(-1).message, /None of the available streams/);
    assert.equal(permanent.streamFetches, 1);
    permanent.retry(); await permanent.settle();
    assert.equal(permanent.errorVisible, false, 'Manual retry begins a fresh attempt');

    const closed = harness(); await closed.settle();
    closed.fail(); closed.close(); await closed.settle();
    assert.equal(closed.video, undefined, 'Closing playback must prevent a pending fallback from reopening it');

    const switched = harness(); await switched.settle();
    const stale = switched.video, staleMedia = switched.media;
    switched.fail(); switched.replace(); await switched.settle();
    stale.props.onError({ currentTarget: staleMedia, target: staleMedia }); await switched.settle();
    assert.equal(switched.video.props.src, 'https://stream.example/another.mp4');
    assert.equal(switched.errorVisible, false, 'Old decoder errors cannot cover a new title');

    const native = harness({ native: true, automatic: true }); await native.settle();
    assert.equal(native.video.props.src, native.source, 'Native playback preserves the first add-on file');
    native.fail(); await native.settle();
    assert.equal(native.errorVisible, true, 'Native playback keeps its existing error handling');
    assert.equal(native.toasts.length, 0, 'Native playback must not show web fallback toasts');
    assert.equal(native.streamFetches, 1);
    console.log('PASS: web compatibility ranking, next-file fallback, deduplicated toasts, preserved playback position, bounded exhaustion, cancellation, and unchanged native ordering.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
