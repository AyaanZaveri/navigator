const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const crypto = require("node:crypto");
const ts = require("typescript");

function load(file, globals = {}) {
    const context = { exports: {}, Event, EventTarget, DOMException, URL, crypto, setTimeout, clearTimeout, ...globals };
    const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
        fileName: file,
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText;
    vm.runInNewContext(code, context);
    return context.exports;
}

async function testController() {
    const { MpvController } = load("lib/desktop/mpv-controller.ts");
    const sent = [];
    const listeners = new Set();
    const bridge = {
        send: (message) => sent.push(message),
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    };
    const receive = (message) => [...listeners].forEach((listener) => listener(message));
    const media = new MpvController(bridge);
    media.volume = 0.6;
    media.muted = true;
    media.playbackRate = 1.5;
    assert.equal(sent.length, 0, "Preference restoration before load must not send commands without a session");
    const headers = { Referer: "https://example.test", "X-Test": "a,b" };
    media.load("https://example.test/video.mkv", headers);
    const first = sent.find((m) => m.type === "load").session;
    let subtitleChanges = 0;
    media.addEventListener("subtitlechange", () => subtitleChanges++);
    receive({ type: "subtitle", session: first, text: "First line\nSecond line" });
    assert.equal(media.subtitleText, "First line\nSecond line");
    receive({ type: "subtitle", session: first, text: "First line\nSecond line" });
    assert.equal(subtitleChanges, 1, "Repeated cues must not trigger redundant React renders");
    media.selectTrack("subtitle", "no");
    assert.equal(media.subtitleText, "", "Turning subtitles off must clear the overlay immediately");
    receive({ type: "subtitle", session: first, text: "Current cue" });
    assert.equal(sent[0].headers, headers);
    assert.equal(sent.find((m) => m.type === "volume").volume, 0.6);
    assert.equal(sent.find((m) => m.type === "muted").muted, true);
    assert.equal(sent.find((m) => m.type === "rate").rate, 1.5);
    let ended = 0;
    media.addEventListener("ended", () => ended++);
    let observedDuration;
    let metadataEvents = 0;
    media.addEventListener("loadedmetadata", () => { observedDuration = media.duration; metadataEvents++; });
    const state = { position: 12, duration: 120, paused: false, volume: 0.6, muted: true, rate: 1.5, buffering: false, seeking: false, buffered: 40, width: 1920, height: 1080 };
    receive({ type: "state", session: first, state });
    receive({ type: "loaded", session: first });
    receive({ type: "ready", session: first });
    assert.equal(observedDuration, 120, "Resume handlers need real metadata at loadedmetadata");
    assert.equal(media.currentTime, 12);
    const preview = media.preview(20);
    const requested = sent.at(-1);
    assert.equal(requested.type, "thumbnail");
    assert.equal(media.currentTime, 12, "Hover preview requests must never seek the playback decoder");
    receive({ type: "thumbnail", session: first, request: requested.request - 1, src: "data:image/jpeg;base64,old", position: 0 });
    receive({ type: "thumbnail", session: first, request: requested.request, src: "data:image/jpeg;base64,frame", position: 18 });
    assert.equal(await preview, "data:image/jpeg;base64,frame");
    const cancelled = media.preview(40);
    media.cancelPreview();
    assert.equal(await cancelled, null, "Leaving hover must cancel pending preview publication");
    assert.equal(media.readyState, 4);
    assert.equal(media.buffered.end(0), 40);
    assert.equal(media.seekable.end(0), 120);
    assert.throws(() => media.buffered.start(1), { name: "IndexSizeError" });
    media.currentTime = 45;
    assert.equal(sent.at(-1).position, 45);
    const count = sent.length;
    media.currentTime = -1;
    media.currentTime = Number.NaN;
    media.volume = Number.POSITIVE_INFINITY;
    assert.equal(sent.length, count, "Invalid numbers must never reach the native boundary");
    receive({ type: "state", session: first, state: { ...state, buffering: true } });
    assert.ok(media.readyState < 3, "Buffering must drive the existing loading indicator");
    let playing = 0;
    media.addEventListener("playing", () => playing++);
    receive({ type: "state", session: first, state });
    assert.equal(playing, 1, "Recovery from buffering must notify Media Chrome that playback resumed");
    receive({ type: "loading", session: first });
    receive({ type: "state", session: first, state: { ...state, position: 65, paused: true } });
    receive({ type: "ready", session: first });
    assert.equal(metadataEvents, 1, "Android codec recreation must not rerun the initial resume/autoplay handler");
    assert.equal(media.currentTime, 65, "Foreground recovery preserves the native session's current position");
    assert.equal(media.paused, true, "Foreground recovery preserves a deliberately paused session");
    media.load("https://example.test/second.mkv");
    const second = sent.filter((m) => m.type === "load").at(-1).session;
    assert.notEqual(first, second);
    assert.equal(media.subtitleText, "", "Replacing a stream must clear its last cue");
    receive({ type: "subtitle", session: first, text: "Stale cue" });
    assert.equal(media.subtitleText, "", "Old sessions must not display subtitles on the new stream");
    receive({ type: "subtitle", session: second, text: "New cue" });
    assert.equal(media.subtitleText, "New cue");
    receive({ type: "ended", session: first });
    receive({ type: "error", session: first, message: "Previous file failed" });
    receive({ type: "state", session: first, state });
    assert.equal(ended, 0, "Stale EOF must not close the next title");
    assert.equal(media.error, null, "Stale failures must not replace the next title");
    assert.equal(media.currentTime, 0);
    receive({ type: "error", session: second, message: "HTTP 403" });
    assert.equal(media.error.message, "HTTP 403");
    assert.equal(media.subtitleText, "", "Playback errors must clear the subtitle overlay");
    await assert.rejects(media.play(), /HTTP 403/);
    media.dispose();
    media.dispose();
    assert.equal(sent.filter((m) => m.type === "stop" && m.session === first).length, 1, "Replacing a source stops its old session");
    assert.equal(sent.filter((m) => m.type === "stop" && m.session === second).length, 1, "Disposing twice stops the active session only once");
    assert.equal(listeners.size, 0);
    const unsafe = new MpvController(bridge);
    let errors = 0;
    unsafe.addEventListener("error", () => errors++);
    for (const url of ["file:///tmp/video", "edl://unsafe", "not-a-url"]) unsafe.load(url);
    assert.equal(errors, 3);
    assert.equal(sent.filter((m) => m.type === "load").length, 2, "Only HTTP(S) loads may be sent");
    unsafe.dispose();
}

function testBridge() {
    let listener;
    const sent = [];
    const document = { documentElement: { dataset: {}, style: { setProperty() {} } }, addEventListener() {} };
    const window = { ipc: { postMessage: (value) => sent.push(JSON.parse(value)) }, addEventListener(type, callback) { if (type === "pagehide") listener = callback; } };
    window.top = window;
    const script = fs.readFileSync("desktop/src/bridge.js", "utf8").replace("__PROTOCOL__", "1").replace("__ORIGIN__", JSON.stringify("http://localhost:3000")).replace("__PLATFORM__", JSON.stringify("macos"));
    vm.runInNewContext(script, { window, document, location: { origin: "http://localhost:3000" }, console });
    assert.equal(window.navigatorDesktop.protocol, 1);
    assert.ok(Object.isFrozen(window.navigatorDesktop));
    let received = 0;
    const remove = window.navigatorDesktop.subscribe(() => received++);
    window.__navigatorDesktopReceive({ type: "fullscreen", value: true });
    assert.equal(window.navigatorDesktop.fullscreen, true);
    assert.equal(received, 1);
    remove();
    window.__navigatorDesktopReceive({ type: "fullscreen", value: false });
    assert.equal(received, 1);
    window.navigatorDesktop.send({ type: "load", session: "example", url: "https://example.test/video" });
    listener();
    assert.equal(sent.at(-1).type, "stop", "Reload must stop its old playback session");
    const foreign = { top: null };
    foreign.top = foreign;
    vm.runInNewContext(script, { window: foreign, location: { origin: "https://untrusted.example" } });
    assert.equal(foreign.navigatorDesktop, undefined);
    const iframe = { top: {} };
    vm.runInNewContext(script, { window: iframe, location: { origin: "http://localhost:3000" } });
    assert.equal(iframe.navigatorDesktop, undefined);
}

function testAskPlayback() {
    const { createStore } = require("jotai/vanilla");
    const atoms = load("lib/atoms.ts", { require });
    const store = createStore();
    store.set(atoms.isAIAskOpenAtom, true);
    const item = { id: "tt123", name: "Fixture", type: "movie" };
    store.set(atoms.playMediaAtom, item);
    assert.equal(store.get(atoms.isAIAskOpenAtom), false, "Starting playback through Ask Navigator must close its panel");
    assert.equal(store.get(atoms.isPlayerVisibleAtom), true, "Launcher and gradients must hide before stream loading completes");
    assert.equal(store.get(atoms.currentMediaAtom), item);
}

testController().then(() => {
    testBridge();
    testAskPlayback();
    console.log("Desktop playback adapter and bridge tests passed.");
}).catch((error) => { console.error(error); process.exitCode = 1; });
