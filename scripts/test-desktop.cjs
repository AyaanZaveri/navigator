const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const crypto = require("node:crypto");
const ts = require("typescript");

function load(file, globals = {}) {
    const context = { exports: {}, Event, EventTarget, DOMException, URL, crypto, ...globals };
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
    assert.equal(sent[0].headers, headers);
    assert.equal(sent.find((m) => m.type === "volume").volume, 0.6);
    assert.equal(sent.find((m) => m.type === "muted").muted, true);
    assert.equal(sent.find((m) => m.type === "rate").rate, 1.5);
    let ended = 0;
    media.addEventListener("ended", () => ended++);
    let observedDuration;
    media.addEventListener("loadedmetadata", () => { observedDuration = media.duration; });
    const state = { position: 12, duration: 120, paused: false, volume: 0.6, muted: true, rate: 1.5, buffering: false, seeking: false, buffered: 40, width: 1920, height: 1080 };
    receive({ type: "state", session: first, state });
    receive({ type: "loaded", session: first });
    receive({ type: "ready", session: first });
    assert.equal(observedDuration, 120, "Resume handlers need real metadata at loadedmetadata");
    assert.equal(media.currentTime, 12);
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
    media.load("https://example.test/second.mkv");
    const second = sent.filter((m) => m.type === "load").at(-1).session;
    assert.notEqual(first, second);
    receive({ type: "ended", session: first });
    receive({ type: "error", session: first, message: "Previous file failed" });
    receive({ type: "state", session: first, state });
    assert.equal(ended, 0, "Stale EOF must not close the next title");
    assert.equal(media.error, null, "Stale failures must not replace the next title");
    assert.equal(media.currentTime, 0);
    receive({ type: "error", session: second, message: "HTTP 403" });
    assert.equal(media.error.message, "HTTP 403");
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

testController().then(() => {
    testBridge();
    console.log("Desktop playback adapter and bridge tests passed.");
}).catch((error) => { console.error(error); process.exitCode = 1; });
