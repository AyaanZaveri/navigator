# mpv startup, resume, and streaming audit

Reviewed November 9, 2026. Scope: the shared playback/discovery path, desktop bridge,
libmpv client wrapper and worker, macOS OpenGL/CAOpenGLLayer integration, native
thumbnail worker, and relevant Windows integration. This is an implementation and
source-backed audit, with headless native regression checks. It does not establish
end-to-end startup times on the user's streaming services or physical GPU presentation.

## Implemented corrections

### Resume before decoding

Previously, `MpvVideo` supplied the saved position to `MpvController.load`, but
only Android/iOS received it in their native load request. Desktop loaded the file
from zero. `FILE_LOADED` crossed the native/JS bridge, and the shared metadata
handler then sent an independent `seek absolute+exact`. mpv could decode/present
its opening frame before that later seek. The extra seek could also restart
network reads, decoder preroll, and buffering.

The desktop bridge now advertises `capabilities.initialSeek`. Supporting runtimes
receive a validated `startPosition` in the load request. The native worker uses:

```text
loadfile <url> replace -1 start=+<seconds>,hr-seek=yes
```

The `-1` insertion-index placeholder is necessary before per-file options in mpv
0.38 and later. The start applies before the initial playback loop. A fresh start
uses `start=none`, clearing any start override without requesting a redundant seek
to zero. Per-file options are restored at the end of the file.

The shared metadata handler avoids issuing a second seek when this capability is
present. It retains the legacy fallback and requests a correction when a saved
position must be clamped to the now-known duration. The latter is covered at the
handler boundary; immediate EOF from an invalid resume point on a real network
source has not been exercised. New runtimes accept old load messages with a
zero default; newer UI omits the field for older desktop runtimes, whose strict
protocol would otherwise reject it.

Sources: [loadfile command](https://github.com/mpv-player/mpv/blob/v0.42.0/DOCS/man/input.rst),
[start and precise-seek options](https://github.com/mpv-player/mpv/blob/v0.42.0/DOCS/man/options.rst),
[initial seek before the playback loop](https://github.com/mpv-player/mpv/blob/v0.42.0/player/loadfile.c).
Context7 located the command documentation; the argument order and behavior were
cross-checked against upstream source and the actual bundled library.

### Overlap discovery work

`createPlaybackStreamRequest` previously waited for TMDB-to-playback-ID resolution
before requesting the account's add-on list. These operations do not depend on one
another. They now run together with `Promise.all`; add-on stream requests still
wait for the canonical ID and retain the episode suffix and configured add-on order.

For these two prerequisites, the dependency changes from approximately
`ID lookup + add-on listing` to `max(ID lookup, add-on listing)`. This is a critical-path
improvement, not a measured claim about the user's CDN. The tests hold ID lookup
pending and verify that add-on listing has already started, then verify canonical
routing, rejection handling, and progressive results.

## Version and library provenance

| Item | Verified result |
| --- | --- |
| Latest official stable mpv release | [0.42.0, November 5, 2026](https://github.com/mpv-player/mpv/releases/tag/v0.42.0) |
| Navigator library pin | [AIOStreams/libs `20261029-fe27405`](https://github.com/AIOStreams/libs/releases/tag/20261029-fe27405), SHA-256 pinned in `desktop/libs.json` |
| Loaded macOS bundled binary | `mpv v0.41.0-dev-g2257f4982`, client API **2.6** |
| Bundled FFmpeg | `git-2026-10-28-c0cd16a` |
| Newer distributor bundle available | [`20261108-19b1008`](https://github.com/AIOStreams/libs/releases/tag/20261108-19b1008): mpv `9aeb21d5b55ef3cc0877663621ca373055dfd5e6`, FFmpeg `ff5da22416a12f0e74cdc0400b65613132ab793c` |

The version string alone is insufficient: the existing development snapshot already
has API 2.6, including D3D11 rendering support documented for stable 0.42.0.
GitHub's comparison between the pinned mpv SHA and the stable tag reports
**diverged histories**, with 107 commits on the stable side. Treat replacement as
a tested library upgrade, not a guaranteed drop-in performance fix. The newer
distributor bundle also changes FFmpeg and is not automatically equivalent to the
stable tag. No library pin or binary bundle was changed by this audit.

The 0.42.0 release includes CoreAudio device-change/channel-map fixes, network-read
cancellation changes, and demuxer/seek fixes. A release changelog does not establish
which improvements are absent from a forked development snapshot or how much
faster this app would become.

## Ranked follow-up work

### 1. Keep preview indexing off the first-frame path

**Evidence:** `Player::FileLoaded` immediately creates `Previews`. Its background
`Session::open` can parse/index the same remote source while the main decoder is
still preparing the initial frame. The preview options permit up to 256 MiB and
2,048 requests, with two thumbnail workers and two fetches. These are ceilings,
not evidence that every file consumes that budget. Dropping a preview invalidates
publication, but the opening thread checks `closed` after `Session::open` returns;
there is no app-owned cancellation signal passed into that open call.

**Proposed change:** defer preview initialization until the current session's first
`PLAYBACK_RESTART`, or initialize on the first hover if the library supports demand
opening cleanly. Preserve early hover requests while opening and cancel on source
replacement. Investigate the media library's cancellation/deadline support before
reducing indexing limits globally.

**Validation:** log request/byte counts and first-ready timings with previews enabled
and deferred on the same cold-cache sources. Cover MP4 with metadata at either end,
large MKV indexes, HLS, rapid replacement, first hover, pause and cancellation.
Expected benefit is reduced startup network/CPU contention; its magnitude is unmeasured.

### 2. Allow native selection to use progressive results under an explicit policy

**Evidence:** native `resolvePlayback` waits for `knownStreams.promise` or the final
`fetchPlaybackStreams` result. Discovery already publishes partial snapshots, but
final completion waits for every add-on. Client add-on reads have a 30-second
budget; the server's guarded outbound read normally has a 15-second timeout.
A slow or unavailable add-on can therefore delay selection after another add-on
has already supplied a playable URL.

**Proposed change:** define when native selection can commit early. Preserve preferred
language, user-configured add-on priority, URL deduplication, exclusions and manual
selection. For example, only commit when pending higher-priority add-ons can no
longer outrank the current candidate, with a separately specified deadline/fallback.
Keep unresolved discovery available for stream switching.

**Validation:** deterministic fast/slow/failing add-on fixtures; preferred-language
results arriving late; a slow highest-priority add-on; expired URLs; manual URLs;
cancellation and concurrent page/player consumers. Do not simply choose the first
network response, which would silently change today's selection semantics.

### 3. Measure macOS render-thread blocking before changing frame pacing

**Evidence:** the macOS callback dispatches to the main queue, calls `display()` and
`CATransaction::flush()`, and draws through `render.render(..., wait=true)`.
The renderer asks mpv to block for the frame target time. This shares time with
WKWebView input/layout. `Held` already records long main-thread render holds, but
there is no per-load latency breakdown or percentile report.

**Proposed change:** measure callback dispatch delay, draw duration, frame-target wait,
and first drawable submission. Then evaluate a render queue/display-clock design
compatible with CAOpenGLLayer/CGL ownership. Preserve hidden/minimized-frame draining.
Do not switch `BLOCK_FOR_TARGET_TIME` off without implementing replacement timing:
upstream explicitly notes that this can disturb A/V synchronization.

**Validation:** 24/30/60 fps, variable frame rate, pause/seek/resize, window occlusion,
other Spaces, SDR/HDR transitions and UI interactions. Physical presentation and
A/V sync need native interactive checks; JS style-update counts cannot prove them.

Source: [render API threading and timing contract](https://github.com/mpv-player/mpv/blob/v0.42.0/include/mpv/render.h).

### 4. Add phase timing and actual decoder diagnostics

The Windows host has useful fixed, URL-free stages; `recordDesktopStage` currently
excludes macOS. Extend the same capability-gated scheme to macOS. Record monotonic
load-to-metadata, load-to-first-ready, and first compositor submission separately.
Read `hwdec-current`, codec/format, dropped-frame counts and cache state on the
worker, not the render thread. `hwdec=auto-safe` enables selection; it does not
prove a particular file is actually hardware decoded.

Benchmark repeated cold/warm runs, normal start and 25/50/90% resume, representative
containers/codecs and slow/fast origins. Record p50/p95, failures, bytes and request
counts. Keep account tokens and complete/signed media URLs out of logs. Current
headless checks establish correctness, not universal startup speed.

### 5. Upgrade the binary bundle as a separate tested change

Evaluate stable 0.42.0 and the newer distributor bundle against the existing pin.
Compare startup/resume, VideoToolbox/software fallback, CoreAudio device changes,
SDR/HDR rendering, subtitles and native preview decoding. Confirm client/render
symbols and dependent-library compatibility; re-pin artifact hashes. Windows
compilation stays on the user's Zenbook over SSH.

This should follow the resume correction so engine-version changes do not obscure
whether the application-level bug was fixed.

### 6. Forward cancellation to upstream add-on reads

`app/api/streams/addon/route.ts` receives a Request but does not pass its signal to
`fetchAddonStreams`/`outboundFetch`. The guarded fetch already supports combining a
caller signal with its timeout. Forwarding it could stop abandoned reads earlier
when the runtime reports a client disconnect. Test disconnect propagation on the
actual deployment; do not assume every runtime reports it identically. Preserve
SSRF/redirect protection, response-size bounds, and per-account add-on ownership.

### 7. Remove idle polling only after checking queue-drain semantics

The worker uses `wait_event(0.02)`, potentially waking roughly 50 times per second
while idle. An event-driven wait using the existing `mpv_wakeup` plus a deadline
for dirty-state delivery could reduce idle CPU/wakeups. Preserve the 250 ms progress
flush, immediate control-state delivery, shutdown, and the 32-command batch limit:
wakeup coalescing must not leave queued commands stranded behind an indefinite wait.
This is primarily an energy/idle-overhead opportunity, not a demonstrated load-time win.

Source: [client API event-loop and wakeup contract](https://github.com/mpv-player/mpv/blob/v0.42.0/include/mpv/client.h).

## API and configuration review

| Area | Current assessment |
| --- | --- |
| Create/options/initialize | One persistent mpv instance; replacing streams does not require recreating the whole engine. Keep this. |
| Ordered commands/properties | Blocking calls are isolated on the player worker. A blanket conversion to `_async` does not make decoding faster and can change ordering. Async errors need request/session correlation. |
| Reads/observations | Observed properties and throttled position updates limit bridge work; control-state changes are immediate. Keep timing diagnostics off the render thread. |
| Sessions/events | Playlist-entry IDs and bridge sessions reject replaced-source events. Readiness is distinct from metadata/buffering completion; retain that separation. |
| Render callbacks | Update callbacks notify the owner; hidden frames are drained. Maintain the advanced-control threading contract and context lifetime rules. |
| GPU surfaces | Video stays in native GPU surfaces. Replacing this with CPU RGBA readback/WebView frames would add copies. |
| Direct rendering | macOS uses OpenGL 3.2 and explicitly disables `vd-lavc-dr`. Its documented GPU requirements/optional render support make forcing it on an unsafe generic optimization. |
| Hardware decode | `auto-safe` is documented as equivalent to `auto`. Changing the spelling provides no speed benefit. Measure `hwdec-current` before forcing VideoToolbox/copy modes. |
| Cache | Loaded bundle defaults: initial cache pause **off**, rebuffer target **1 second**, max demuxer cache **150 MiB**, stream buffer **128 KiB**, probe info **auto**. A very large `cache-secs` ceiling does not mean startup waits for that duration; the byte bound still matters. |
| Probing | `probe-info=auto` skips safe cases. Forcing `no`, very small probe budgets or guessed demuxers can lose tracks or break containers. |
| Networking | Guarded HTTP uses connection reuse, redirects and bounded reads. Preserve those protections. Increasing per-origin concurrency or speculative GETs needs provider-specific evidence. |
| Stream preparation | Existing page/player sharing and next-episode preparation avoid duplicate work. Browser range warming is not a shared native mpv decoder cache. |
| Metal | Stable render.h exposes OpenGL, D3D11 and software render backends, not a direct Metal backend. A native Metal migration is architectural work, not a `gpu-api` toggle for the current libmpv OpenGL context. |

Do not apply a blanket “low latency” profile to VOD: disabling caches, reducing
analysis to zero, forcing decoder threads, dropping A/V synchronization, or forcing
unsafe hwdec modes changes reliability/quality rather than establishing faster
correct playback. Increasing `stream-buffer-size` can also reduce performance.

Sources: [stable options](https://github.com/mpv-player/mpv/blob/v0.42.0/DOCS/man/options.rst),
[client API](https://github.com/mpv-player/mpv/blob/v0.42.0/include/mpv/client.h),
[render API](https://github.com/mpv-player/mpv/blob/v0.42.0/include/mpv/render.h),
[official embedding examples](https://github.com/mpv-player/mpv-examples/tree/master/libmpv),
[IINA's macOS controller](https://github.com/iina/iina/blob/develop/iina/MPVController.swift).
IINA is useful for its platform-specific decoder workarounds and separately
configurable cache behavior; it does not justify copying its settings blindly.

## Verification and practical limits

- `scripts/test-native-resume.cjs`: failed before the fix on macOS; passes for
  capability-gated load positions, invalid-number sanitization, zero starts,
  legacy runtimes, the actual metadata handler's duplicate-seek suppression and
  duration-clamp fallback.
- `scripts/test-mpv-initial-frame.py`: actual bundled libmpv plus generated H.264
  video and the image VO. Without initial resume, the first decoded image is red
  (RGB 254,0,0). At 3.2 seconds it is blue (0,0,255); a following `start=none` load
  returns red. The fixture timings include image decoding/checking and warm-up;
  they are deliberately not reported as a stream-start benchmark.
- Targeted Rust `headless_library_playback_and_session_replacement`: passes against
  the bundled library, with the first ready state at the requested two-second
  position and a rapid zero-start replacement that does not inherit it.
- Native unit suite: 10 pass, 5 environment-dependent tests ignored; the targeted
  headless resume test above was explicitly run separately.
- Stream-discovery startup, page/player request sharing, all five metadata/stream
  parallelism variants, episode continuation/selection, native readiness, desktop
  bridge, Windows control and macOS window-control checks pass. The existing
  parallelism fixture needed its pure dependency stubs updated for current imports.
- TypeScript passes. No new app package, installation, release, physical cursor/
  frame-presentation check, real CDN timing run, or Windows compilation is included.
  The published 0.3.6 packages predate these fixes; a new native package is required.

Reproduce the headless checks without starting the app/dev server:

```sh
node scripts/test-native-resume.cjs
node scripts/test-stream-discovery-startup.cjs
python3 scripts/test-mpv-initial-frame.py  # ffmpeg + bundled macOS libmpv
NAVIGATOR_TEST_LIBMPV="$PWD/desktop/vendor/macos-aarch64/libmpv.2.dylib" \
  cargo test --manifest-path desktop/Cargo.toml --locked \
  headless_library_playback_and_session_replacement -- --include-ignored
```
