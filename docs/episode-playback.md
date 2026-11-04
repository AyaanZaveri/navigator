# Episode playback defaults

Settings → Playback saves two independent preferences on this device:

- Episode autoplay defaults to on. At the actual `ended` event, it advances to
  the following aired episode, crossing season boundaries. Movies and finales
  retain the normal end/close behavior. Turning it off retains manual Next.
- Episode prefetch defaults to off. When enabled, it prepares only the next
  episode during the last 90 seconds (or the last 20% of shorter videos).
  This also speeds up manual Next when autoplay is off.

The manual Next button and autoplay share one continuation owner, identity
lookup and preparation. Progress reporting completes the current episode
before starting the following one. Duplicate/bubbling end events cannot skip
an episode. Changing titles or closing cancels owned requests; disabling
prefetch cancels preparation without removing manual Next. React Strict Mode
replay creates a fresh owner rather than retaining an aborted session.

Preparation resolves the next stream with the existing language and browser
compatibility rules, plus artwork/title metadata. The player reuses the
resolved request instead of fetching streams again. After a pause longer than
two minutes, stream preparation is refreshed to reduce expired signed URLs.
A failed preparation falls back to the ordinary player loader.

For browser direct-file streams, a best-effort range request warms the first
2 MiB in the browser's HTTP cache. It has a 10-second timeout, rejects servers
that ignore Range, stops oversized responses, and skips manifests or streams
requiring native-only request headers. The origin and browser decide whether
those partial responses are reusable: see [RFC 9111 §3.3–3.4](https://www.rfc-editor.org/rfc/rfc9111.html#section-3.3).
This is not a guaranteed decoded-video buffer or a guaranteed instant start.
HLS and native decoders reuse the prepared stream and metadata, but their
video data caches are separate; this implementation does not prebuffer their
first seconds. No native package/engine change is included.

Validation: `npm run test:episode-continuation`, `npm run test:player-settings`,
TypeScript and the existing web recovery/page/bridge regressions. The unit
suite covers cancellation, stale events, one-shot prefetch, age limits,
normal-loader fallback, subtitles/audio preference persistence, boundaries,
Strict Mode replay and bounded HTTP warming. Device playback timing remains
something to measure on real streams.
