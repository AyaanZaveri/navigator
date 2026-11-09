const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

let now = 0;
let nextId = 1;
const timers = new Map();
const context = {
  exports: {},
  setTimeout(callback, delay) { const id = nextId++; timers.set(id, { callback, at: now + delay }); return id; },
  clearTimeout(id) { timers.delete(id); },
};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/media/web-startup-watchdog.ts', 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, context);
const { installWebStartupWatchdog, WEB_STARTUP_WATCHDOG_MS } = context.exports;

class Target extends EventTarget {
  constructor() { super(); this.currentTime = 0; this.paused = true; this.seeking = false; this.hidden = false; }
  emit(type) { this.dispatchEvent(new Event(type)); }
}
function advance(ms) {
  now += ms;
  for (;;) {
    const entry = [...timers.entries()].find(([, timer]) => timer.at <= now);
    if (!entry) break;
    timers.delete(entry[0]); entry[1].callback();
  }
}
function setup() {
  now = 0; timers.clear();
  const video = new Target(); const doc = new Target(); let stalls = 0;
  const cleanup = installWebStartupWatchdog(video, () => stalls++, doc);
  return { video, doc, cleanup, stalls: () => stalls };
}

{
  const t = setup();
  t.video.paused = false; t.video.emit('play');
  advance(WEB_STARTUP_WATCHDOG_MS - 1); assert.equal(t.stalls(), 0);
  advance(1); assert.equal(t.stalls(), 1); t.cleanup();
}
{
  const t = setup();
  t.video.paused = false; t.video.emit('play'); advance(3000);
  t.video.paused = true; t.video.emit('pause'); advance(WEB_STARTUP_WATCHDOG_MS * 2);
  assert.equal(t.stalls(), 0);
  t.video.paused = false; t.video.emit('play'); advance(WEB_STARTUP_WATCHDOG_MS);
  assert.equal(t.stalls(), 1); t.cleanup();
}
{
  const t = setup();
  t.video.paused = false; t.video.emit('play'); advance(3000);
  t.video.seeking = true; t.video.emit('seeking'); t.video.currentTime = 40;
  t.video.seeking = false; t.video.emit('seeked'); advance(WEB_STARTUP_WATCHDOG_MS - 1);
  assert.equal(t.stalls(), 0); advance(1); assert.equal(t.stalls(), 1); t.cleanup();
}
{
  const t = setup();
  t.video.paused = false; t.video.emit('play'); advance(3000);
  t.video.currentTime = 0.06; t.video.emit('timeupdate');
  advance(WEB_STARTUP_WATCHDOG_MS * 2); assert.equal(t.stalls(), 0); t.cleanup();
}
{
  const t = setup();
  t.video.paused = false; t.video.emit('play'); advance(3000);
  t.doc.hidden = true; t.doc.emit('visibilitychange'); advance(WEB_STARTUP_WATCHDOG_MS * 2);
  assert.equal(t.stalls(), 0);
  t.doc.hidden = false; t.doc.emit('visibilitychange'); advance(WEB_STARTUP_WATCHDOG_MS);
  assert.equal(t.stalls(), 1); t.cleanup();
}
console.log('web startup watchdog tests passed');
