const assert = require('node:assert/strict');
const fs = require('node:fs');

// Keep tests runnable without installing a runner/transpiler: exercise the same
// source by compiling this small exported helper with the project's TypeScript.
const ts = require('typescript');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../lib/media/stream-playability.ts'), 'utf8');
const js = ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 });
function localRequire(name) {
  if (!name.startsWith('@/')) return require(name);
  const context = { exports: {}, require: localRequire, URL };
  vm.runInNewContext(ts.transpile(fs.readFileSync(name.slice(2) + '.ts', 'utf8'), { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }), context);
  return context.exports;
}
const sandbox = { exports: {}, require: localRequire, setTimeout, clearTimeout, Promise, Number };
vm.runInNewContext(js, sandbox);
const probe = sandbox.exports.verifyMediaElementPlayback;

function fake() {
  const listeners = {};
  const counts = { pause: 0, remove: 0, play: 0 };
  return { counts,
    webkitVideoDecodedByteCount: 0, webkitAudioDecodedByteCount: 0,
    addEventListener: (k, f) => (listeners[k] ||= new Set()).add(f),
    removeEventListener: (k, f) => listeners[k]?.delete(f),
    fire: k => [...(listeners[k] || [])].forEach(f => f()),
    style: {}, setAttribute() {}, removeAttribute() {}, load() {}, remove() { counts.remove++; }, pause() { counts.pause++; },
    play() { counts.play++; return Promise.resolve(); },
    getVideoPlaybackQuality() { return { totalVideoFrames: 0 }; },
  };
}
const tick = () => new Promise(r => setTimeout(r, 0));
(async () => {
  let v = fake(), c = new AbortController();
  const supported = probe(v, c.signal, 100);
  v.webkitVideoDecodedByteCount = 12; v.webkitAudioDecodedByteCount = 8; v.fire('timeupdate');
  assert.equal(await supported, 'supported');

  v = fake(); c = new AbortController();
  const metadataOnly = probe(v, c.signal, 5); v.fire('loadeddata');
  assert.equal(await metadataOnly, 'unknown');

  v = fake(); c = new AbortController(); v.webkitVideoDecodedByteCount = 10;
  assert.equal(await probe(v, c.signal, 5), 'unknown', 'Playing video without decoded audio must never pass');
  v = fake(); c = new AbortController(); v.webkitAudioDecodedByteCount = 10;
  assert.equal(await probe(v, c.signal, 5), 'unknown', 'Decoded audio without video must never pass');
  v = fake(); c = new AbortController(); delete v.webkitAudioDecodedByteCount;
  v.webkitVideoDecodedByteCount = 10;
  assert.equal(await probe(v, c.signal, 5), 'unknown', 'Missing browser evidence cannot be treated as success');

  v = fake(); c = new AbortController();
  v.nativeEl = { webkitAudioDecodedByteCount: 3, webkitVideoDecodedByteCount: 4 };
  assert.equal(await probe(v, c.signal, 100), 'supported', 'Mux probes inspect native decoder counters');
  assert.equal(v.counts.remove, 1, 'Clean the Mux host, not just its internal video');

  v = fake(); c = new AbortController(); v.play = () => Promise.reject(new Error('autoplay'));
  assert.equal(await probe(v, c.signal, 100), 'unknown');

  v = fake(); c = new AbortController();
  const aborted = probe(v, c.signal, 100); c.abort();
  v.webkitVideoDecodedByteCount = 1; v.webkitAudioDecodedByteCount = 1; v.fire('timeupdate');
  assert.equal(await aborted, 'unknown');
  await tick(); assert.equal(v.counts.play, 0, 'Aborting before the play microtask cannot restart a cleaned-up probe');

  v = fake(); c = new AbortController();
  const errored = probe(v, c.signal, 100); v.error = { code: 3 }; v.fire('error');
  assert.equal(await errored, 'unsupported');

  v = fake(); c = new AbortController();
  v.play = function () {
    assert.equal(this.muted, true, 'Preview audio must not be audible');
    assert.ok(this.style.cssText.includes('clip-path'), 'Probe players must not appear in the UI');
    this.webkitAudioDecodedByteCount = 10; this.webkitVideoDecodedByteCount = 10;
    this.fire('timeupdate'); return Promise.resolve();
  };
  sandbox.document = { createElement() { return v; }, body: { append() {} } };
  assert.equal(await sandbox.exports.probeStreamPlayability({ url: 'https://example.test/movie.mkv' }, { signal: c.signal }), 'supported');
  assert.equal(v.counts.pause, 1); assert.equal(v.counts.remove, 1);
  await tick();
  console.log('stream-playability tests passed');
})().catch(e => { console.error(e); process.exitCode = 1; });
