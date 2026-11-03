# Navigator Desktop

Navigator's existing Next.js/React UI above native **libmpv** playback. Video
frames stay in the native GPU surface; a small JSON bridge carries commands and
state. Browser playback continues to use the current Mux/HTML media player.

## Windows private build

Windows builds run only on the user's Zenbook via `ssh navigator-windows`,
from a reviewed source snapshot at `C:\Users\amanz\Code\navigator`. Do not
use GitHub Actions or Blacksmith for Windows builds. GitHub may host source and
private installer releases. Packaging produces `Navigator-<version>-windows-x64-setup.exe`
and `Navigator-<version>-windows-x64-portable.zip`. Builds target Intel/AMD
Windows 11 PCs and remain unsigned private builds with manual upgrades.

The installer runs per user, adds a Start menu shortcut and uninstall entry,
and installs Microsoft Edge WebView2 Evergreen if missing. The downloaded
bootstrapper must have a valid Microsoft Authenticode signature before it can
be included. The portable ZIP must be extracted in full and needs an installed
WebView2 runtime. Both variants retain sign-in/settings in
`%LOCALAPPDATA%\Navigator Desktop`; uninstalling keeps that profile.

To package on Windows x64, install Rust 1.92+, MSVC C++ build tools/Windows SDK,
Node 26.7.0 and NSIS (`makensis.exe` on PATH, or `NAVIGATOR_MAKENSIS` set to its
absolute path), install the web dependencies, then run:

```powershell
npm run desktop:fetch-libs
npm run desktop:package
```

Packaging builds the native EXE with the existing multi-size Windows icon,
version resources and a Per-Monitor V2 manifest. It also includes the standalone
Next server, pinned Node runtime and native libraries. The ZIP explicitly keeps
`.next/static`; no user credentials are bundled. Build on Windows for release
artifacts; cross-target `cargo check` skips Windows resource compilation. The
Windows packaging script uses an explicit x64 target and a static MSVC C runtime;
Release verification inspects imports so the release needs no separately installed Visual C++ runtime.

Windows draws minimize, maximize/restore and close inside the app, with no
separate system title bar. Native caption hit testing retains window dragging,
double-click maximize, Alt+Space, Alt+F4 and Snap (HTMAXBUTTON). Fullscreen hides
the window buttons and retains F11/Escape behavior. Its minimum client size is 480×360 logical pixels; player controls
wrap in narrow windows. Normal window size/position and maximized state persist,
and saved placement is clamped onto an available display. A second launch
restores/activates the running window.

The Windows header uses the web's top spacing and keeps account actions beside
search. Horizontal clearance protects the caption buttons in narrow windows;
there is no extra caption row. The account menu expands to the right below the
avatar and clamps to the viewport. The shared page scrollport uses
Radix's overlay thumb on every platform, preserving native scrolling without
reserving a scrollbar gutter.

After extraction, the installer runs the native `--prepare-install` mode once:
it verifies startup code/UI files against a SHA-256 manifest, starts and checks
the bundled local service on an ephemeral loopback port, then initializes a
headless video engine. The owned job cleans up the service and its descendants.
This creates no WebView profile, reads no sign-in cookies and changes no antivirus
settings. Errors abort installation with details in `installation.log`; timings
are recorded in `installation.jsonl` beside the normal startup log. The Start
menu shortcut points directly to the app without this flag. Portable users can
run `navigator-desktop.exe --prepare-install` once after extraction.

The first frame is a small native loading view. Backend and mpv initialization
run on a worker while the window remains responsive. WebView2 starts in parallel
and paints a bundled startup document that requires no server or network. The
document shares Android's ship mark and static teal light fields. It shows an
elapsed timer and actual backend/interface/player stages after a 1.5-second delay; it does not simulate
installation progress or promise that a slow launch happens only once. The
same WebView navigates as soon as the backend listens, while mpv continues
initializing. Up to 64 validated playback commands can wait for the player;
overflow reports a session error. A painted React readiness signal removes the
native loading view and synchronizes the caption theme. Closing during startup cancels the
backend wait. The backend is assigned to a kill-on-close Windows Job Object
atomically at creation, then resumes without a console; its descendants cannot
outlive Navigator. Playback frames stay native, and progress stays throttled
while control-state changes are delivered immediately.

### Windows verification and performance

```powershell
npm run test:windows-desktop
npm run desktop:check
$env:NAVIGATOR_TEST_NODE = (Get-Command node).Source
cargo test --manifest-path desktop/Cargo.toml --locked job_closes_backend_and_descendants -- --include-ignored
./scripts/windows-smoke.ps1 -Executable ./dist/desktop-win32-x64/navigator-desktop.exe
./scripts/windows-smoke.ps1 -Executable ./dist/desktop-win32-x64/navigator-desktop.exe -LaunchApp -StartupDelaySeconds 8
./scripts/windows-overlay-smoke.ps1 -Executable ./dist/desktop-win32-x64/navigator-desktop.exe
./scripts/windows-fullscreen-smoke.ps1 -Executable ./dist/desktop-win32-x64/navigator-desktop.exe
node scripts/test-windows-install.cjs
./scripts/windows-performance.ps1 -AppProcessId <NavigatorPID> -Seconds 30
```

The smoke check starts no server, uses generated color bars and a separate
`Navigator Desktop\smoke` profile, verifies native playback progress and the
WebView bridge, captures the compositor output, checks visible bars, and closes
normally. Keep screenshots and timing logs as local compositor diagnostics.
It does not establish hardware decoding, HDR accuracy or physical-display behavior.
The installed-app check deliberately blocks Node startup for eight seconds and
checks a screenshot of the bundled startup screen before the backend is ready.
It then verifies the hydrated app, caption hit testing and normal shutdown.
The overlay regression uses the production native-playback and wordmark CSS
over a local test video. It checks that a descendant with explicit visibility
cannot leak out of the retained browsing page. Run screenshot checks in the
signed-in desktop session, not SSH session zero. The Windows page's opacity is
suppressed during playback, preserving layout/scroll state while hiding the
entire composed surface, including wordmarks and backdrop effects.

`startup.jsonl` in the local data directory records elapsed milliseconds for
`window-visible`, `backend-starting`, `backend-ready`, `player-starting`,
`player-ready`, `webview-starting`, `startup-view-created`, `startup-page-loaded`,
`navigation-starting`, `page-loaded` and `app-ready` (`webview-created` in the
video-only smoke test). The visibility mark records the native show call, not a measured
display scanout; readiness records the painted hydrated shell, not completion
of remote catalog requests. Logs rotate at 1 MiB and contain no media URLs or
credentials. First-window and interactive-startup goals are 300 ms and
1 second warm / 2.5 seconds cold respectively; these are goals until measured
on the target PC. Compare repeated cold and warm Release launches separately.

New Windows shells advertise `capabilities.timings`. Their log also records
`client-interface-hydrated`, `client-play-requested`, `client-player-mounted`,
`client-stream-resolving`, `client-stream-resolved`, `playback-load-received`,
`playback-open-started`, `playback-file-loaded`, `playback-seek-requested`, and
the first `playback-ready` for each load. These distinguish deferred JavaScript,
stream resolution, native opening and resume seeks without logging URLs or titles.
Older shells receive none of the new diagnostic requests. Windows preloads the
player chunk while idle so its download/evaluation need not wait for first Play.

One measured Windows cold launch took 24.6 seconds: the backend listened at
6.8 seconds, navigation started immediately, and the hydrated interface was
ready at 24.6 seconds. The player initialized in parallel and was ready at
9.5 seconds. This remains a startup performance issue; showing the bundled
startup document quickly does not establish fast application readiness.
The Zenbook's subsequent log showed a 26.4-second cold launch followed by two
warm launches at 1.9 and 1.8 seconds. The cold backend took 7.9 seconds and the
interface another 18.4 seconds. No dependencies are installed at app launch.

A November 2 Defender recording attributed 11.3 seconds of cumulative scan time
to the bundled Node process and 4.8 seconds to the native app. These durations can
overlap. A controlled reinstall followed by installation preparation reduced the
first normal launch from 22–26 seconds to 2.1 seconds on the Zenbook. Targeted
preparation took 28.3 seconds during installation. This measures first launch
after installation, not launch after an OS reboot or every antivirus configuration.
The installer is not rerun by the shortcut.

The fullscreen transition restores a maximized frameless window before entering
borderless fullscreen, then remaximizes it on exit. F11 is handled in the WebView
capture phase and by the native parent when it has keyboard focus; held keys do
not repeatedly toggle. The native fullscreen regression measures physical monitor
and client bounds and checks that the bottom screen pixel belongs to Navigator,
without setting the app topmost (which would hide a taskbar regression).

The performance script records the complete Navigator/Node/WebView2 process
tree's summed working sets, private bytes, CPU and available GPU engine counters.
Working-set sums may count shared pages more than once. GPU columns sum the
matching engines and remain blank when counters are unavailable/localized.
Use WebView2 DevTools' Performance panel (`--devtools`) for long tasks and frame
stalls, and Windows Performance Recorder/Analyzer for native scheduling and GPU
investigation. Measure idle browsing and playback separately.

Before accepting a private build on physical Windows hardware, check:

- Installation, upgrade and uninstall on a PC without Node or developer tools;
  sign-in survives upgrade and uninstall leaves settings intact.
- Snapping, 480×360 controls, keyboard focus, second-launch activation,
  maximize/fullscreen restoration and moving between 100/150/200% DPI displays.
- Transparent controls, subtitles, pause/seek/volume feedback, expired streams,
  rapid replacements, minimize/restore, sleep/resume and audio-device changes.
- Closing during backend startup and playback leaves no owned Node process.
- SDR playback and HDR-to-SDR fallback. Validate HDR on a physical HDR display,
  including SDR→HDR→SDR, Windows HDR toggles and moving between SDR/HDR monitors,
  before making HDR claims.

ARM64 release artifacts, OS media controls,
public signing, Store distribution and automatic updates remain later milestones.

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
between files retain EDR for 1.5 seconds only while metadata is unavailable.
Known SDR switches immediately to an explicitly tagged sRGB layer with matching
`target-prim=bt.709`, `target-trc=srgb`, and full-range RGB output. Core Animation
performs display-profile conversion; mpv's ICC transform remains disabled to avoid
double conversion. This same SDR setup applies on startup, SDR displays,
unsupported HDR metadata/colorspaces, and 8-bit surfaces; mpv tone-maps HDR to SDR
when the display/surface cannot present HDR. The React controls stay in their existing WebView.

Native HDR tests use local, tagged `pq.mkv`, `hlg.mkv`, and `sdr.mkv` fixtures:

```sh
node scripts/generate-hdr-fixtures.mjs /path/fixtures  # ffmpeg + libx265
NAVIGATOR_TEST_LIBMPV=/path/libmpv.2.dylib NAVIGATOR_TEST_HDR_DIR=/path/fixtures \
  cargo test --manifest-path desktop/Cargo.toml --locked -- --include-ignored
cargo run --manifest-path desktop/Cargo.toml --example hdr-check -- \
  /path/libmpv.2.dylib /path/fixtures
```

The native check renders SDR → PQ → SDR → HLG → SDR → PQ → SDR through the actual OpenGL layer,
checks the initial/return sRGB tag and EDR/colorspace state, and exercises fullscreen without a backend or
saved account. It reports whether the display and surface support HDR; an SDR
machine verifies fallback rather than HDR brightness. Use known HDR test patterns
on an HDR display for final visual/color validation.

The mpv manual's [`cocoa-cb-output-csp` guidance](https://mpv.io/manual/stable/#options-cocoa-cb-output-csp)
requires the layer tag to match the VO's target primaries/transfer. Navigator owns
its OpenGL layer, so it configures that tag directly rather than using mpv's
Cocoa window option. A related [upstream SDR gamma report](https://github.com/mpv-player/mpv/issues/14648)
concerns Windows HDR mode; its configuration is not applied to our Windows backend.

This version does not include AIOStreams' custom Metal/AVFoundation outputs or
Dolby Vision output, native PiP, automatic updates, or torrent resolution.
It plays the HTTP(S) stream URLs Navigator already obtains from addons.

## Documentation consulted

The macOS window uses Tao's transparent titlebar, hidden title and full-size
content view, keeping the native traffic lights in the app header. Blank header
space starts a native window drag through the origin-checked bridge; links,
inputs and menus keep their normal mouse behavior. The header and player back
button reserve space for the traffic lights, and restore the normal inset in
fullscreen. macOS resets the standard scrollbar properties to `auto` so WebKit
can apply the same 6px scrollbar and transparent track used by the site.

- [Tao macOS window extensions](https://docs.rs/tao/0.37.2/tao/platform/macos/trait.WindowBuilderExtMacOS.html):
  transparent titlebar, full-size content and traffic light inset (also consulted
  through Context7); [native window dragging](https://docs.rs/tao/0.37.2/tao/window/struct.Window.html#method.drag_window).
- [WebKit scrollbar precedence](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Selectors/::-webkit-scrollbar):
  non-auto standard scrollbar properties override the WebKit pseudo-elements.
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
