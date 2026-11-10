# Shared local media-byte cache

Implemented November 9, 2026 in `desktop/src/media_cache.rs` and the native player.
The cache is **local process memory only**: no cloud service, database, cache files
or cross-device synchronization.

## Behavior

For HTTP(S) URLs ending in `.mp4`, `.m4v`, `.mov`, `.mkv` or `.webm`, each load gets
an isolated, random-token endpoint bound to `127.0.0.1` on an ephemeral port. mpv
and the existing AIOStreams thumbnail decoder read that same source. Credentials
are applied by the source only to its upstream requests; they are not sent to the
loopback endpoint or exposed to the web UI.

Playback streams continuously from the origin and retains up to **64 MiB** of
source-file bytes. There is no HEAD preflight or speculative full-file download.
A first-time preview reads retained bytes when available; sparse misses request
only the missing intervals. JPEG reuse still operates independently above this
layer. The memory limit means an mpv-buffered interval can outlive its retained
source bytes; such an evicted interval may need another request.

Playback never waits on a preview's download, and preview writes cannot evict
playback bytes. A preview briefly waits (up to 150 ms) for an imminent in-flight
read instead of starting a duplicate transfer. If that read remains stalled, the
preview can retry later rather than competing with it. At most two preview
connections are admitted. Client/header parsing, connection count and upstream
read/connection timeouts are bounded; data is relayed in at most 64 KiB chunks.

Source replacement keeps the old endpoint alive until mpv switches files, avoiding
prematurely truncating an active demuxer read. Stop/end/source retirement clears
retained bytes. Retired network reads may finish within their bounded timeout,
but cannot repopulate the cache or publish old previews.

## Compatibility

- Single-byte-range, suffix, open-ended, HEAD, Content-Range/206 and 416 responses
  are handled. Incoming multipart and unsupported conditional requests are rejected;
  this is a private endpoint for native decoders, not a general HTTP proxy.
- Initial non-range and unknown-length origin responses remain streaming responses;
  they are not buffered whole. No-range origins keep their existing behavior.
- Total size and available ETag/Last-Modified validators prevent combining different
  representations. Uncached follow-up reads use If-Range when a validator exists.
- Original request headers are preserved upstream, with identity encoding for byte
  offsets. Redirect behavior uses ureq's credential rules: cookies are removed on
  redirect; Authorization can survive same-host HTTPS redirects. Eight redirects
  are allowed. Errors contain no complete source URL or credentials.
- The endpoint requires its 128-bit OS-random token and exact loopback Host. Foreign
  Origin headers, alternate paths and unsupported methods cannot access it. No
  CORS access is enabled.
- HLS/DASH, extensionless URLs, local files and credential-bearing URL userinfo
  retain direct playback. Adaptive/text responses encountered at a file URL are
  redirected to the original URL instead of resolving relative segments locally.
- A native playback failure while using the local source retries the original URL
  once, preserving original headers, saved/current position and pause. It cannot
  loop back into the cache. Providers using nonstandard TLS/authentication can
  therefore keep using the original mpv networking path.

## Documentation consulted

- [mpv custom-stream API](https://github.com/mpv-player/mpv/blob/v0.42.0/include/mpv/stream_cb.h):
  app-provided sources feed mpv; they do not expose its packet cache. A loopback
  source also works with the existing URL-only thumbnail reader without an engine
  patch or a fork of the thumbnail library.
- [mpv commands/cache export](https://github.com/mpv-player/mpv/blob/v0.42.0/DOCS/man/input.rst):
  cache export is not used on hover; its documented blocking behavior is avoided.
- [HTTP semantics, RFC 9110 §14](https://www.rfc-editor.org/rfc/rfc9110.html#name-range-requests):
  byte ranges, Content-Range, partial responses, validators and If-Range.
- [ureq 3.5 configuration](https://docs.rs/ureq/3.5.0/ureq/config/struct.ConfigBuilder.html)
  and [streaming response readers](https://docs.rs/ureq/3.5.0/ureq/struct.Body.html):
  connection reuse, per-read versus whole-response timeouts and redirect credentials.
- [AIOStreams range reader](https://github.com/AIOStreams/media/blob/87dee2ccd7c39aa9baf1e739292e14fa9f0d8ec7/container/src/http.rs):
  native previews already accept an ordinary HTTP range source.

Context7 was queried for mpv cache/stream APIs; precise semantics were checked
against the upstream header/manual, RFC, and the installed ureq source.

## Verification

Eight deterministic HTTP/cache tests cover first-time preview reuse, sparse misses,
large offsets, suffix/invalid/unsatisfiable ranges, memory eviction, playback priority,
concurrent readers, validators, source isolation, redirects, no-range origins,
Authorization, HEAD, endpoint restrictions and retirement during an active read.

Actual-library integration uses a generated seekable H.264 MP4 (79,707 bytes), mpv's
null video/audio outputs, and the real native thumbnail decoder. Playback resumed
at 3.2 seconds while new previews at 0.5 and 4.5 seconds generated different JPEGs.
**One origin request transferred exactly 79,707 bytes across playback, indexing and
both new previews.** Provider Authorization and Origin headers were included.
A separate forced first-request failure verifies direct fallback, retained pause
and correct resume. These are correctness/request-reuse checks, not real-CDN
latency, visual presentation, sustained throughput or GPU benchmarks.

Run the cache unit tests with:

```sh
cargo test --manifest-path desktop/Cargo.toml --locked media_cache::tests
```

Run actual-library checks with the two environment variables pointing to your
native library and generated test video:

```sh
NAVIGATOR_TEST_LIBMPV=/path/to/libmpv \
NAVIGATOR_TEST_VIDEO=/path/to/video.mp4 \
cargo test --manifest-path desktop/Cargo.toml --locked headless_shared \
  -- --include-ignored --nocapture --test-threads=1
```

Windows compilation and tests run only on the user's Zenbook. No app package,
installation or release was created for this change; an updated native app build
is needed to use the cache in the installed application.
