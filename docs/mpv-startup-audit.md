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
| Navigator library pin | [AIOStreams/libs `20261108-19b1008`](https://github.com/AIOStreams/libs/releases/tag/20261108-19b1008), SHA-256 pinned in `desktop/libs.json` |
| Loaded macOS bundled binary | `mpv v0.41.0-dev-g9aeb21d5b`, client API **2.6** |
| Bundled FFmpeg | `git-2026-11-06-ff5da224` |
| Newer distributor bundle available | [`20261108-19b1008`](https://github.com/AIOStreams/libs/releases/tag/20261108-19b1008): mpv `9aeb21d5b55ef3cc0877663621ca373055dfd5e6`, FFmpeg `ff5da22416a12f0e74cdc0400b65613132ab793c` |

The version string alone is insufficient: the existing development snapshot already
has API 2.6, including D3D11 rendering support documented for stable 0.42.0.
GitHub's comparison between the pinned mpv SHA and the stable tag reports
**diverged histories**, with 107 commits on the stable side. Treat replacement as
a tested library upgrade, not a guaranteed drop-in performance fix. The newer
distributor bundle also changes FFmpeg and is not automatically equivalent to the
stable tag. The follow-up updates the library pin and validates the new bundle separately; it does not claim stable-tag equivalence or a measured startup speedup.

The 0.42.0 release includes CoreAudio device-change/channel-map fixes, network-read
cancellation changes, and demuxer/seek fixes. A release changelog does not establish
which improvements are absent from a forked development snapshot or how much
faster this app would become.

## Follow-up implementation (November 9)

The recommendations were tackled separately; these source changes have not been
packaged into a new app release.

1. **Preview startup and reuse:** native preview indexing starts after the first
   playback-ready event. Early hover requests are retained. The UI caches actual
   keyframes and their half-open time intervals, coalesces identical pending
   requests, and keeps bounded image/alias caches per source. A repeat hover in
   an already-generated keyframe interval needs no native/network request.
   The follow-up shared source below reuses retained original file bytes; it
   does not export mpv's demuxed packets.
   Native source replacement cancels publication; in-flight library indexing
   still lacks app-owned interruptible network cancellation.
2. **Progressive native stream selection:** a preferred-language candidate can
   be chosen when all higher-priority add-ons have settled. Missing/mixed/other
   language candidates still wait for discovery completion. URL deduplication,
   exclusions, manual selection and configured add-on order remain authoritative.
   Discovery continues for switching. Language ranking is cached per resolution.
3. **macOS render scheduling:** coalesce queued update notifications and schedule
   future frame targets with cancellable deadline tickets. Recheck mpv when the
   deadline fires; retain its final render-time timing guard and hidden-frame
   draining. This reduces redundant queued work; interactive A/V sync, HDR,
   occlusion and UI responsiveness still require native validation. No measured
   frame-rate or first-presentation improvement is claimed.
4. **Diagnostics:** capability-gated fixed client stages now include macOS.
   Debug logging records monotonic load-to-metadata and load-to-first-ready,
   plus actual hardware decoder and video codec on the worker. No media URLs
   are added. These stages require debug logging; first-ready is not physical
   presentation, and compositor timing / dropped-frame benchmark reports remain
   follow-up measurement work.
5. **Library refresh:** all four platform archive hashes are updated to the newer
   distributor bundle below. macOS ARM64 and Windows x64 libraries passed actual
   headless resume/preview checks; macOS Intel and Windows ARM64 archives passed
   hash/integrity verification only. This is not a stable mpv 0.42.0 upgrade.
6. **Cancellation:** the add-on route forwards its Request signal through the
   existing guarded fetch. Already-aborted requests stop before auth/upstream
   work; expected cancellation returns 499 without upstream-error logging.
   Ownership and outbound protections remain. Real deployment disconnect
   propagation depends on its runtime and has not been measured here.
7. **Idle event loop:** replace fixed 20 ms polling with mpv wakeups and the dirty
   state delivery deadline. Every command sender wakes mpv; a full 32-command
   batch drains without an indefinite wait. Positive waits round up with a 1 ms guard to avoid Windows timer truncation
   near the 250 ms flush boundary (at most 2 ms added delivery latency).
   The headless test covers an 80-command burst, paused seeking and shutdown.
8. **Buffered ranges:** publish mpv's actual disjoint seekable cache ranges instead
   of depicting everything before a resumed position as downloaded. Older native
   runtimes retain the legacy estimate. These ranges report time coverage, not
   accessible compressed media bytes.

9. **Shared local source bytes:** mpv and previews now read one bounded,
   per-load 64 MiB memory cache for eligible HTTP file streams. New previews
   reuse retained playback bytes, sparse misses fetch missing intervals,
   playback never waits on preview reads, and failures retry the direct source
   once with resume/pause/headers preserved. No cloud/database/disk storage.
   See [shared-media-cache.md](shared-media-cache.md) for scope and tests.

Sources: [client event/wakeup contract](https://github.com/mpv-player/mpv/blob/v0.42.0/include/mpv/client.h),
[render timing/threading contract](https://github.com/mpv-player/mpv/blob/v0.42.0/include/mpv/render.h),
[cache properties](https://github.com/mpv-player/mpv/blob/v0.42.0/DOCS/man/input.rst),
[Request.signal](https://developer.mozilla.org/en-US/docs/Web/API/Request/signal).
The source comparison for previews is in [preview-cache-research.md](preview-cache-research.md).

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
- Native unit suite: macOS binary 21 pass / 8 ignored and HDR example 16 pass /
  8 ignored; Windows binary 26 pass / 8 ignored. Environment-dependent tests
  remain opt-in. Actual-library resume/replacement and deferred-preview checks
  were explicitly run on macOS ARM64 and the Zenbook Windows x64.
- Stream-discovery startup, page/player request sharing, all five metadata/stream
  parallelism variants, episode continuation/selection, native readiness, desktop
  bridge, Windows control and macOS window-control checks pass. The existing
  parallelism fixture needed its pure dependency stubs updated for current imports.
- TypeScript and targeted preview-cache, range, progressive-selection and add-on
  cancellation checks pass. Native tests were compiled on macOS and the Zenbook.
  No new app package, installation, release, physical cursor/frame-presentation
  check or real CDN timing run is included.
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
