const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
let captureBlocked = false;
const context = { exports: {}, setTimeout, clearTimeout, document: { createElement() {
  return { width: 0, height: 0, getContext: () => ({ drawImage() { if (captureBlocked) throw new Error('SecurityError'); } }), toDataURL: () => 'data:image/jpeg;base64,fixture' };
} } };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/media/preview-frames.ts', 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, context);
class Video extends EventTarget {
  readyState = 2; currentTime = 0; videoWidth = 1920; videoHeight = 1080; seeking = false;
  src = 'https://stream.test/movie.mp4'; crossOrigin = 'anonymous'; loads = 0; error = null;
  fastSeek(time) { this.currentTime = time; this.seeking = true; }
  finish() { this.seeking = false; this.dispatchEvent(new Event('seeked')); }
  pause() {} removeAttribute() {}
  load() { this.loads++; this.error = null; this.readyState = 0; this.seeking = false; }
}
let failures = 0;
function test(name, check) { try { check(); console.log('PASS:', name); } catch (error) { failures++; console.error('FAIL:', name, error.message); } }
test('A late error cannot overwrite a cached preview', () => {
  const video = new Video(), results = [];
  const provider = new context.exports.BrowserPreviewFrames(video, (...args) => results.push(args));
  try {
    provider.want(20); video.finish();
    provider.want(60); provider.want(20);
    video.error = { code: 2 }; video.dispatchEvent(new Event('error'));
    assert.equal(results.at(-1)[0], 20);
    assert.ok(results.at(-1)[1]?.startsWith('data:image/jpeg'), 'Cached frame must survive the older failed seek');
  } finally { provider.dispose(); }
});
test('A frame becoming ready after seeked completes on canplay', () => {
  const video = new Video(), results = [];
  const provider = new context.exports.BrowserPreviewFrames(video, (...args) => results.push(args));
  try {
    provider.want(20); video.readyState = 1; video.finish();
    assert.equal(results.length, 0);
    video.readyState = 2; video.dispatchEvent(new Event('canplay'));
    assert.equal(results.at(-1)?.[0], 20);
    assert.ok(results.at(-1)?.[1]);
  } finally { provider.dispose(); }
});
test('Progressive playback can retry without CORS and display a video frame', () => {
  const video = new Video(), results = [];
  const provider = new context.exports.BrowserPreviewFrames(video, (...args) => results.push(args), false, true);
  try {
    provider.want(20); video.error = { code: 4 }; video.dispatchEvent(new Event('error'));
    assert.equal(video.crossOrigin, null, 'Cross-origin capture failure should retry playable video without anonymous CORS');
    assert.equal(video.loads, 1);
    assert.equal(results.length, 0, 'A recoverable failure is still loading');
    video.readyState = 1; video.dispatchEvent(new Event('loadedmetadata'));
    video.readyState = 2; captureBlocked = true; video.finish();
    assert.equal(results.at(-1)?.[0], 20);
    assert.equal(results.at(-1)?.[2], true, 'Canvas restrictions still allow a displayed video preview');
    video.error = { code: 4 }; video.dispatchEvent(new Event('error'));
    assert.equal(video.loads, 1, 'Retry remains bounded');
  } finally { captureBlocked = false; provider.dispose(); }
});
process.exitCode = failures ? 1 : 0;
