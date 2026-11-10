# Seek preview caches: source comparison

Reviewed November 9, 2026. Repository clones are read-only research snapshots under
`/tmp/navigator-research-*`; no upstream code was copied into Navigator.

## Three different things

- **Keyframe index:** a small map from time to the file offsets needed to decode
  preview frames. Building it reads MP4 sample tables or Matroska cues; it is not
  a hosted thumbnail database or a copy of the whole video.
- **Thumbnail cache:** small JPEGs already generated for particular keyframes.
  Navigator currently retains these locally in process memory during playback.
  Repeat requests in a known keyframe interval can reuse the image immediately.
- **Shared media-byte cache:** downloaded source-file bytes usable by both the
  main player and preview decoder. Navigator's independent mpv and thumbnail
  HTTP readers previously did not share this. The new local source described below
  shares retained file bytes. A buffered time range alone is not
  a pointer to those bytes.

None of these concepts inherently requires cloud storage, a central database or
cross-device synchronization.

## Infuse

[Firecore's Settings Overview](https://support.firecore.com/hc/en-us/articles/360015608854-Settings-Overview)
documents memory/disk read-ahead caching and a Live Previews setting.
A [Firecore support-forum answer](https://community.firecore.com/t/plex-video-preview-thumbnails/51965)
says Infuse generates seek thumbnails on demand, without requiring Plex's
pre-generated video previews. These public descriptions do not establish whether
Infuse's preview decoder shares its downloaded playback bytes. No source-code
claim about that internal mechanism is made here.

## Harbor

The historical `harborstremio/harbor` repository returned 404. This review uses the
public preserved fork `canonrebel04/harbor`, snapshot
`a7c734098b716dfda07c20991ca8a1c12966fe44`; it is evidence about that snapshot,
not a guarantee about newer or private Harbor versions.

- [thumbs.rs](https://github.com/canonrebel04/harbor/blob/a7c734098b716dfda07c20991ca8a1c12966fe44/src-tauri/src/thumbs.rs)
  starts a separate paused mpv process with the media URL, null video output,
  no audio/subtitles, a 32 MiB decoder cache, keyframe seeking and JPEG screenshots.
  It caches generated data URIs in two-second buckets with LRU byte/entry limits
  (48 MiB / 160 entries), retaining the newest requested preview. Temporary JPEG
  files belong to the preview session and are removed on shutdown.
- [mpv.rs](https://github.com/canonrebel04/harbor/blob/a7c734098b716dfda07c20991ca8a1c12966fe44/src-tauri/src/mpv.rs)
  separately configures the main player's disk demuxer cache. The preview spawn
  receives the source URL, not the main player's cached packet file.
- [use-trickplay.ts](https://github.com/canonrebel04/harbor/blob/a7c734098b716dfda07c20991ca8a1c12966fe44/src/views/player/hooks/use-trickplay.ts)
  restricts torrent previews to buffered content. That restriction does not itself
  share mpv's cache. A torrent engine can serve already-downloaded pieces through
  its own local URL; that is a different storage layer from mpv's packet cache.
- `thumb_cache.rs` is a separate URL/width-keyed local image-file cache. Its name
  alone is not evidence of sharing downloaded video bytes with seek previews.

Thus this Harbor implementation uses a separate decoder and local preview-image
reuse, rather than exposing the main mpv buffer to its UI.

## AIOStreams

Application snapshot `Viren070/AIOStreams`
`1d680ef9dd02696c21b4303e106be9707e4188aa`:
[desktop thumbnails.rs](https://github.com/Viren070/AIOStreams/blob/1d680ef9dd02696c21b4303e106be9707e4188aa/packages/desktop/core/src/thumbnails.rs)
explicitly generates previews outside mpv from the named file. It opens the media
URL with the standalone thumbnail library and delivers local thumbnail paths to
the page. The retained JPEG collection is bounded to 256 entries. This offers an
additional possible Navigator improvement: local image-resource delivery instead
of JPEG base64 in bridge messages; it has not been implemented in this pass.

Library snapshot `AIOStreams/media`
`8e293042462475acf07fe9590498b72b47ad5063`:

- [README](https://github.com/AIOStreams/media/blob/8e293042462475acf07fe9590498b72b47ad5063/README.md):
  reads container indexes using bounded HTTP ranges, decodes individual keyframes,
  generates JPEGs and keeps a bounded cache for repeat requests. Newest-request
  prioritization avoids spending decode work on superseded hover positions.
- [session.rs](https://github.com/AIOStreams/media/blob/8e293042462475acf07fe9590498b72b47ad5063/thumbs/src/session.rs):
  decoded thumbnails are keyed by keyframe index. Fetch workers use forked sources.
- [http.rs](https://github.com/AIOStreams/media/blob/8e293042462475acf07fe9590498b72b47ad5063/container/src/http.rs):
  each RangeReader retains its last byte range. Forks share the HTTP agent but
  start with an empty byte-range cache. There is no connection to mpv's cache here.

The application also has an Android ExoPlayer block cache. Its existence does not
establish sharing with mpv or with the native thumbnail decoder. The reviewed
Android thumbnail JNI entry opens the passed URL with the same media library;
we have not established a thumbnail read path into those ExoPlayer blocks.

## What mpv actually exposes

[mpv's command API](https://github.com/mpv-player/mpv/blob/v0.42.0/DOCS/man/input.rst)
provides `screenshot-raw` for the current decoded frame, and `dump-cache` for
exporting cached packets into a remuxed local file. Therefore saying the cache
can *never* be accessed was too absolute. However, upstream warns that dumping a
large cache blocks playback; the command is experimental and may produce an
incomplete ending. It is not a nonblocking arbitrary-timestamp thumbnail API.

The [custom stream API](https://github.com/mpv-player/mpv/blob/v0.42.0/include/mpv/stream_cb.h)
lets an application provide bytes *to* mpv. It does not return mpv's existing
packet cache. A bounded local range cache could feed both mpv and previews through
an app-owned source or authenticated loopback endpoint. That is a feasible design,
not a feature demonstrated in the reviewed desktop implementations.

## Navigator implementation and current boundary

The follow-up now implements a [shared local media-byte cache](shared-media-cache.md)
for eligible desktop HTTP file streams, in addition to per-source keyframe/JPEG
reuse and deferred indexing. Both mpv and previews read an app-owned loopback
source. Previously downloaded bytes are reused while retained in its bounded
64 MiB memory cache; sparse misses fetch only missing ranges.

There is no cloud database or disk cache. HLS/DASH and extensionless URLs keep
their direct path. Evicted source bytes can still require a refetch even if mpv
retains their demuxed packets. Direct playback is retried once if the cache source
fails. See the implementation notes for validation and practical limits.
