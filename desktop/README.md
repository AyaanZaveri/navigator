# Navigator Desktop

Navigator's existing Next.js/React UI above native **libmpv** playback. Video
frames stay in the native GPU surface; a small JSON bridge carries commands and
state. Browser playback continues to use the current Mux/HTML media player.

The renderer is adapted from AIOStreams; see [THIRD-PARTY.md](THIRD-PARTY.md)
for exact provenance and the AGPL license.

## Development

Requirements:

- **Rust 1.92 or newer**, Cargo, and the platform's native compiler tools.
- The web project's dependencies installed normally.
- macOS 13.5+: Xcode command line tools and `libmpv.2.dylib` (`brew install mpv`), or
  the verified libraries downloaded below. The standard OpenGL compatibility
  output works with stock libmpv; special patched output drivers are not required.
- Windows: MSVC build tools and the WebView2 runtime. Run
  `npm run desktop:fetch-libs` to install pinned native libraries.
- Linux: GTK 4.14+, WebKitGTK 6, libmpv 0.38+, and their development packages
  (for example `libgtk-4-dev libwebkitgtk-6.0-dev libmpv-dev` on a recent Ubuntu).

Keep the existing Next development server running, then start only the shell:

```sh
npm run desktop:dev
# Alternate existing server:
NAVIGATOR_DESKTOP_URL=http://localhost:3001 npm run desktop:dev
# Explicit library override:
NAVIGATOR_LIBMPV=/absolute/path/libmpv.2.dylib npm run desktop:dev
```

`desktop:dev` never starts another Next server. It compiles/runs the Rust shell
and loads the specified server. The bridge is injected only into the top-level
page on that exact origin (including the port). Use a trusted Navigator server.
Other HTTP(S) navigation opens the system browser; arbitrary schemes are denied.

Native library lookup order: `NAVIGATOR_LIBMPV`/`--libmpv`, packaged
`resources/lib`, `desktop/vendor/<os>-<arch>`, then standard system locations.
OS/architecture folder names use Rust's names (`macos-aarch64`, `windows-x86_64`).

Only one native instance may use a profile. Cookies and web storage are kept in
the platform's local data directory under `Navigator Desktop/webview`.
Restarting with a different server origin starts that origin's own session.

Configure provider keys in **Settings → Navigator**, and the TMDB API Read
Access Token in **Settings → Artwork**. Artwork tokens are validated before
saving, persist in the WebView's HttpOnly cookie storage for a year, and can
be replaced or removed in Settings. Desktop artwork does not read environment
credentials. Rejected replacements preserve the working token.

## Verification

```sh
npm run test:desktop
npm run test:image-layout  # macOS: real WKWebView card sizing regression
npx tsc --noEmit
npm run desktop:check
```

The JavaScript tests exercise state/events, volume preferences, metadata before
resume, invalid URLs, stale sessions, teardown, and bridge origin/frame checks.
The native checks run formatting plus Rust protocol tests. Neither check starts
Next or launches a browser. The image layout check renders the actual React
cards and Tailwind utilities in an isolated, nonpersistent WKWebView using local
fixture images. It verifies poster, continue-watching, and episode image bounds,
including the nested percentage-height issue that can otherwise crop images in
WebKit. It starts no server and does not use Navigator's saved profile.

An optional integration test exercises an actual libmpv instance headlessly
(load, metadata, pause, seek, volume, rapid file replacement, and shutdown):

```sh
NAVIGATOR_TEST_LIBMPV=/absolute/path/libmpv.2.dylib \
  cargo test --manifest-path desktop/Cargo.toml --locked headless_library_playback -- --include-ignored
```

Manual native checks, on each target OS:

For a standalone compositor check, run `npm run desktop:dev -- --smoke-test`.
It generates local color-bar video beneath a transparent HTML control panel,
with working pause, seek, and native fullscreen. It starts no server and needs
no sign-in or external media. This diagnostic uses the native bridge directly;
the full React player should still be checked against the web app below.

1. Sign in and play a direct HTTP(S) MP4/MKV/HLS stream, including one requiring
   addon request headers. Confirm video appears beneath the React controls.
2. Pause, seek, change volume/speed, choose embedded audio/subtitles, then select
   external subtitles. Confirm playback position and progress reporting agree.
3. Enter/exit fullscreen using the control, F11, Escape, and macOS's window
   button; resize, minimize, restore, and move the window between displays.
4. Switch titles quickly and close during loading; confirm stale events do not
   close the new player, and audio stops on close/reload/logout.
5. Try an expired URL and an unsupported source; confirm the error and retry UI.
6. Quit the app; packaged runs must also terminate their owned Node server.

## Packaging

```sh
npm run desktop:fetch-libs  # macOS/Windows; SHA-256 checked pinned release
npm run desktop:package
# Repackage existing native release + Next standalone builds:
npm run desktop:package -- --skip-build
```

Packaging is an explicit action: it runs Next's build and Cargo's release build,
then copies the Next standalone server **plus `public` and `.next/static`**.
It downloads an official, checksum-verified Node runtime so a Homebrew-linked
Node binary is not accidentally shipped. `.env*` files and the runtime response
cache are excluded. Users configure their provider and artwork credentials in
Settings. A pre-provisioned portable library bundle can be supplied with
`NAVIGATOR_LIBS_DIR`.

Output is `dist/desktop-<platform>-<arch>`; macOS produces `Navigator.app` with
an ad hoc development signature. Packaging generates the macOS icon from
`public/logo/desktop/navigator.png`, includes all standard/Retina sizes in
`Contents/Resources/Navigator.icns`, and registers it in `Info.plist`.
The web logo remains `public/logo/navigator.png`.
Public distribution still needs release
signing/notarization, installers, and a full dependency license review.
Packaging refuses to overwrite an existing output directory.

The packaged shell owns its standalone server, binds it to **127.0.0.1:37371**,
waits for startup, and stops/reaps it on exit. An occupied port is an error; it
never silently attaches the privileged bridge to a different running server.
`--port <port>` changes this stable origin. `--resources <folder>` overrides
the server/runtime/lib resource folder; `--url <url>` uses an existing server
and does not start a backend.

## Implementation

| Platform | Native surface | React overlay |
| --- | --- | --- |
| macOS | libmpv render API into `CAOpenGLLayer` | Transparent WKWebView in the same window |
| Windows | mpv Direct3D 11 into a child HWND | Transparent WebView2 above the child |
| Linux | libmpv render API into `GtkGLArea` | Transparent WebKitGTK 6 inside `GtkOverlay` |

Blocking mpv commands run on a worker thread; the render thread never waits on
them. State updates are throttled to 250 ms, with important state changes sent
immediately. Playlist entry IDs associate file events with frontend sessions.
The web document stays transparent from first paint; the app's normal backdrop
is a separate element hidden during native playback.

`MpvController` and `<navigator-mpv>` implement the media-element contract used
by the existing Media Chrome controls. Native fullscreen is supplied through a
custom MediaStore mediator, keeping the video and controls in one native window.
Picture-in-picture is hidden for native playback. Embedded text subtitle cues
come from mpv's `sub-text` property and use the same blurred React overlay as
addon subtitles; mpv's own subtitle display is disabled.
Native cues stay plain text and clear on track changes, replacement, loading,
errors, and playback end. Bitmap subtitles do not expose text through `sub-text`
and are outside this custom text-overlay path.

The Ask Navigator launcher hides as soon as playback starts loading. Starting a
title from Ask closes its panel, and home/Ask gradient backgrounds unmount for
the entire visible-player lifetime. They return after playback is closed.

The bridge exposes only load/play/pause/seek/volume/mute/rate/track/stop and
native fullscreen. It validates message sizes, numbers, header syntax, and URL
schemes. The player disables user scripts/config, reference following, and
unsafe playlists, and constrains FFmpeg's stream protocols.

### Scrubber previews on web and desktop

Hovering the timeline shows the existing Dice UI preview card, timestamp, and a
Skeleton until the requested frame is ready. Supplied VTT/sprite thumbnails and
`tooltipThumbnailSrc` still take priority. `MediaPlayerSeek previewFrames`
enables on-demand extraction when a stream supplies no storyboard.

- Desktop preloads the file index after playback loads, then uses the pinned
  AIOStreams/media library to read selected keyframes with HTTP ranges. It keeps
  96 JPEGs, decodes with two background workers, and fetches at most two frames
  concurrently. It never seeks the playback decoder. Stream request headers are
  reused; the page can request only its current session's thumbnail, not an
  arbitrary URL or file. Responses are checked against the latest keyframe and
  request before publication.
- Web uses a separate muted HTML video decoder (Mux/MSE for manifest streams),
  preloads metadata, uses `fastSeek` where supported, and captures small sRGB
  JPEGs into a 96-frame LRU. Late seek errors cannot overwrite cached frames;
  canplay/progress events finish frames that were not ready at seeked. Progressive
  streams can retry once without anonymous CORS and display the decoded video
  directly when canvas readback is forbidden. Loading timeouts remain loading,
  while actual media errors can report unavailable.
  Requests use two-second buckets and a leading/trailing 60 ms throttle. Rapid
  movement skips obsolete work; hover exit cancels publication and source
  changes reset caches. The last frame stays under the loading skeleton.
- HLS uses the browser/WebView decoder. Native extraction requires indexed
  MKV/WebM or MP4/MOV and byte-range support. Unsupported streams show a preview
  unavailable state while normal playback and seeking remain usable. No server
  transcoding or extra backend is needed.
- Native JPEG previews of HDR10/HLG sources are tone-mapped to SDR. Browser
  previews also prefer cached sRGB snapshots, including on HDR-capable displays;
  a display capability alone no longer disables the thumbnail cache. Capture
  restrictions fall back to a visible video frame. Main HDR playback is unchanged.

`npm run test:desktop` checks caching, cancellation, stale sessions, and both
preview backends' scheduling. `npm run test:webkit-previews` runs actual video →
canvas capture/cache checks in an isolated WebKit view with a generated local
H.264 fixture; it starts no server or user browser. The optional native tests
also decode real PQ/HLG/SDR keyframes and verify cache reuse.

### HDR on macOS

HDR10/PQ and HLG video automatically use HDR on an HDR-capable display with a
16-bit float OpenGL surface. This follows AIOStreams' compatibility renderer:
mpv converts the input to PQ with matching BT.2020/P3 primaries, Core Animation
uses the matching PQ colorspace and EDR, and `target-peak` tracks the display's
brightness headroom (203 nits reference white). Small changes below 5% avoid
rebuilding mpv's shaders. Window/display changes coalesce over 250 ms; brief gaps
between files retain EDR for 1.5 seconds. SDR restores automatic output settings.
SDR displays, unsupported metadata/colorspaces, and 8-bit surfaces keep mpv's
normal SDR tone mapping. The React controls stay in their existing WebView.

Native HDR tests use local, tagged `pq.mkv`, `hlg.mkv`, and `sdr.mkv` fixtures:

```sh
node scripts/generate-hdr-fixtures.mjs /path/fixtures  # ffmpeg + libx265
NAVIGATOR_TEST_LIBMPV=/path/libmpv.2.dylib NAVIGATOR_TEST_HDR_DIR=/path/fixtures \
  cargo test --manifest-path desktop/Cargo.toml --locked -- --include-ignored
cargo run --manifest-path desktop/Cargo.toml --example hdr-check -- \
  /path/libmpv.2.dylib /path/fixtures
```

The native check renders PQ → SDR → HLG → SDR → PQ → SDR through the actual OpenGL layer,
checks the EDR/colorspace state, and exercises fullscreen without a backend or
saved account. It reports whether the display and surface support HDR; an SDR
machine verifies fallback rather than HDR brightness. Use known HDR test patterns
on an HDR display for final visual/color validation.

This version does not include AIOStreams' custom Metal/AVFoundation outputs or
Dolby Vision output, native PiP, automatic updates, or torrent resolution.
It plays the HTTP(S) stream URLs Navigator already obtains from addons.

## Documentation consulted

- [wry 0.57 WebViewBuilder](https://docs.rs/wry/0.57.0/wry/struct.WebViewBuilder.html):
  transparency, initialization, IPC, origin checks, and child views.
- [mpv client API](https://github.com/mpv-player/mpv/blob/master/include/mpv/client.h)
  and [render API](https://github.com/mpv-player/mpv/blob/master/include/mpv/render.h):
  ABI, event lifetimes, playlist IDs, GL context/thread rules, and teardown.
- [mpv manual](https://mpv.io/manual/stable/): embedding options, stream protocols,
  header quoting, playback properties, and commands.
- Context7: [Apple EDR](https://developer.apple.com/documentation/quartzcore/caopengllayer/wantsextendeddynamicrangecontent),
  [display headroom](https://developer.apple.com/documentation/appkit/nsscreen/maximumextendeddynamicrangecolorcomponentvalue),
  and the mpv manual's `target-trc`, `target-prim`, `target-peak`, and tone mapping.
- [Media Chrome media elements](https://www.media-chrome.org/docs/en/media-element)
  and [React hooks](https://www.media-chrome.org/docs/en/react/hooks), together
  with the installed 4.12.0 MediaStore implementation/types.
- [Dice UI Media Player](https://diceui.com/docs/components/base/media-player):
  seek tooltip, thumbnail source/sprite support, and preview slot layout.
- Context7: [Media Chrome preview thumbnails](https://www.media-chrome.org/docs/en/components/media-time-range#preview-thumbnails),
  [HTML fastSeek](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/fastSeek),
  and [canvas origin restrictions](https://developer.mozilla.org/en-US/docs/Web/HTML/How_to/CORS_enabled_image).
- [Next standalone output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output):
  server packaging, static/public assets, HOSTNAME, and PORT.
- [Next cookies](https://nextjs.org/docs/app/api-reference/functions/cookies):
  persistent HttpOnly cookies in Server Actions and rendering after updates.
- [TMDB application authentication](https://developer.themoviedb.org/docs/authentication-application)
  and [token validation](https://developer.themoviedb.org/reference/authentication-validate-key):
  API Read Access Tokens, Bearer headers, and validation before saving.
- [shadcn dropdown menus](https://ui.shadcn.com/docs/components/radix/dropdown-menu):
  existing Radix menus, radio groups, portal containers, and accessible labels.
- [Node official release artifacts](https://nodejs.org/dist/v26.7.0/): portable
  platform binaries, LICENSE, and SHA-256 manifests.
- [Node 26 supported platforms](https://github.com/nodejs/node/blob/v26.7.0/BUILDING.md#platform-list):
  the packaged runtime requires macOS 13.5+ and Windows 10+.
