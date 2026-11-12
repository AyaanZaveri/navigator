# Navigator 0.5.0 — Windows

0.5.0 is a feature release after 0.4.1. In-app updates introduce a new desktop capability; the accompanying metadata, discovery and rendering improvements are broader than a patch release. 1.0 remains a separate product-stability milestone.

## Included changes

- Windows in-app updates: header shortcut, Settings → About, automatic/manual checks, Ed25519-verified downloads and user-controlled installation/restart. The installer verifies a staged copy before replacing a recognized Navigator installation, preserves prior installations on preparation failure and refuses unrelated folders or interrupted staging/backup directories.
- Shared title and episode metadata readers/cache, earlier detail preloading, batched notifications, more accurate provider release years and sharper progressively loaded episode stills.
- Continue Watching background warmup and its per-device setting; visible-card/intent prefetch, shared stream requests and reuse of already-resolved playback metadata.
- Independent home-row streaming, faster and batched watch-history reads, optimistic watched/web-search toggles, more responsive subtitle choices, less player-clock/header/logo work and lighter Navigator rendering.
- Search presentation, artwork loading, alert-dialog material, add-on removal and small interface refinements committed since 0.4.1.
- All shipped 0.4.1 native playback/media-byte preview caching, buffer ranges, cancellation, library pins and installation-readiness fixes are retained. Integration also consumes late shared-discovery errors after an already-cancelled playback caller exits.

## Source scope

The release integrates main through `6d60313`, the separate `release-0.4.1` history, and the Windows updater originally committed as `1ee2bfc`. This avoids rebuilding older main without the native features already shipped in 0.4.x. Version metadata is 0.5.0 in npm and Cargo manifests/locks. Windows compilation and packaging run only on the Zenbook; macOS/iOS/Android packages are not part of this release request.

Existing 0.4.1 installations need one manual bootstrap installation to obtain the updater. Future Windows update packages are verified using the embedded public key; Windows Authenticode publisher signing remains unconfigured. The GitHub update feed is published only after its exact referenced installer has been uploaded and verified.

Build validation and artifact digests are recorded after packaging. No new video performance, HDR or blur claim is made by this release.
