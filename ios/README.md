# Navigator for iPhone and iPad

Universal iOS/iPadOS 17+ application: the hosted Navigator UI in a persistent
WKWebView, with MobileVLCKit 3.7.5 rendering native video beneath shared controls.
The backend remains hosted; no Next.js server, provider keys, Apple account,
certificate, or provisioning profile is embedded in the app.

## IPA builds

The **iOS IPA** Actions workflow builds on macOS 26 with Xcode 26.6. It runs native
policy/transport tests and a simulator playback test, archives an ARM64 device app
without signing, packages `Payload/Navigator.app`, and publishes **Navigator-iOS.ipa**
as a direct artifact. Download it from the successful workflow and re-sign it with
your chosen installation tool. It is deliberately not ready for installation
until signed. One IPA supports both iPhone and iPad. TestFlight/App Store are not
part of this build path.

Signing stays disabled during both archive and package creation. Packaging does
not call `-exportArchive`. `build-info.json` records commit, Xcode version, hash,
and signing status. Embedded frameworks are separate, so re-signing tools must
sign them as well as the app. VideoLAN license text is bundled with the app.

## Local development

Use Ruby 3.3, install full Xcode and select its Developer directory. The Command Line Tools
alone do not contain UIKit, the iOS SDK, simulators or Swift Testing.

```sh
cd ios
bundle install
bundle exec pod install --deployment
open Navigator.xcworkspace
```

The project and dependency locks are committed. `generate-project.rb` rebuilds
project structure if files/targets change; run it through the locked bundle,
then run `pod install` again. Never commit `Pods/`, `.build/`, build archives,
Xcode user data, server credentials, provisioning profiles or signing keys.

Native logic tests: `swift test --package-path ios` from the repository root.
Web bridge check: `node scripts/test-ios-bridge.cjs`.

## Native contract

`window.navigatorDesktop` remains protocol 1 and reports `platform: "ios"`,
`engine: "vlc"`, and capabilities. No second JavaScript player API is introduced.
Only the trusted, top-level HTTPS origin can issue native commands. Every
playback operation is session scoped; stale commands cannot control a new title.
The controller supplies `startPosition` with the initial load so resume does not
reveal the opening frame first. Native previews are capability selected, not
hard-coded to Android. PiP, AirPlay and background playback remain unavailable. Native materials and
surface gestures are capability selected independently from Android frame-based glass.

Precise resume uses VLC's value-less `no-input-fast-seek` switch. Its cached
clock may report preroll while the first sought frames are already presenting;
the startup cover follows decoder readiness, and the initial UI cursor stays at
the requested position until that clock catches up. Fit changes are idempotent
to avoid resize feedback. Read terminal events in their delegate callback before
a subsequent Stopped event replaces the SDK's cached Ended state.

The default server is `https://navigator-strm.vercel.app`. Change it through the
app's existing native-settings action or the native connection failure screen.
Login persists in `WKWebsiteDataStore.default()` and remains isolated by origin.
Media networking uses a separate ephemeral URLSession without cookies or stored
credentials. The shell never copies website login cookies to media requests.

## Provider headers and streaming

Sources must be HTTPS without embedded usernames/passwords. Header-bearing
sources use a per-session gateway listening only on IPv4 loopback, on an ephemeral
port, behind an unguessable token. It accepts only GET/HEAD and single byte
ranges, limits concurrent clients to six, bounds request headers to 16 KB,
and rewrites HLS keys/segments and DASH BaseURL/template references. Templates
remain visible to VLC's substitution logic; original signed query strings are
preserved. Redirects cannot downgrade to HTTP. Only public request hints
(User-Agent/Referer/Origin) can follow a cross-origin redirect; private headers
remain scoped to the original source origin. There is no global ATS bypass.

Media bytes stream through bounded queues with URLSession suspension for
backpressure, not a whole-file in-memory download. Manifests are capped at 2 MB.
Cancel, source changes and scene destruction close the listener, clients and
upstream tasks. Ordinary sources without headers stay direct.

One independent native preview decoder generates a requested one-second sample;
completed JPEGs live in a 16 MB LRU cache. The playing decoder is never sought
for previews. The web controller also retains frame/image caches. Preview work
stops when backgrounded and source changes invalidate every old result.

## Scenes, layout and lifecycle

Each scene owns its web view, playback adapter and preview worker. A shared
coordinator pauses another scene before new playback starts. Auto Layout and
CSS dynamic viewport units use the current window's bounds; no fixed full-screen
iPad opt-out is present. Phone fullscreen requests landscape and handles denied
geometry updates without blocking playback. iPad retains its current window
orientation and supports resizes. Browsing keeps WebKit edge navigation; the
player's left-edge gesture closes playback. Hardware volume stays native.

The audio session uses playback/moviePlayback. Background/inactive scenes pause,
release audio focus and detach rendering; returning does not secretly resume
audio. Calls and headphone removal pause as well. Network/loading/error and server
settings UI remain available if the hosted website fails.

## Native interactions and materials

Horizontal surface drags pause the playing decoder, emit display-coalesced preview
positions, and commit one seek on release. Moving toward the top continuously
reduces sensitivity using Android's incremental curve; changing height alone
never jumps the target. Cancellation preserves the original position and play
intent. Controls, menus, the timeline, safe areas and system edge gestures retain
their own touch handling. Browser surface seeking is disabled only when the
native gesture capability is present; direct timeline dragging stays shared.

Left vertical swipes adjust screen brightness; right vertical swipes adjust
**Device volume**, while VLC's audio gain stays at 100%. The HUD matches Android:
an 18-point Lucide icon, a 6-point white track over a 20%-white rail, a transparent
56-by-232-point touch area, relative drags, and 900 ms dismissal. Volume's icon
toggles device mute and restores the last audible level. Roomy iPad windows scale
all bar metrics by 1.3; compact windows retain phone sizing. There are no top-right
sun/speaker buttons. Back's VoiceOver actions expose the adjustable bars.

Device volume uses a window-backed MPVolumeView and its UISlider, following
[VLC for iOS's implementation](https://github.com/videolan/vlc-ios/blob/ace69689287a412375a5996a8717296fcd73a3f6/Sources/Playback/Player/VideoPlayer-iOS/SliderInfoView.swift).
Writes coalesce for 10 ms and cancel when playback ends or backgrounds. Public
AVAudioSession outputVolume observation keeps hardware changes synchronized;
it is not treated as writable. The shared controller skips restoring saved media
gain into device volume when loading a title. An unavailable device route never
falls back to changing VLC gain. Simulator routes can have fixed output volume;
physical-device validation remains required.

Brightness ownership saves/restores the previous value, respects Control Center
changes, and releases on backgrounding, closing, or another scene taking playback.

Back uses UIButton.Configuration.glass() on iOS/iPadOS 26+, without a clipping
material ancestor, so UIKit owns its press expansion. Leaving its circular touch
area cancels activation, even when the finger returns before release. Older
versions use a separate UIBlurEffect backing. The arrow is 20 points within a
44-point circular touch target. A native-generated chrome session keeps Back
available while fetching streams, before a playback session exists.

The preview background uses UIGlassEffect on iOS/iPadOS 26+, and UIBlurEffect
on iOS 17–18. Its material lives between the VLC surface and transparent WebView;
the image/text remain shared. Bounded layout messages supply exclusions and
preview bounds, validated against the chrome session and current viewport.
Web materials are replaced only after native geometry acknowledgement. Native
surfaces remain at alpha 1; transitions animate the material effect. Reduce
Transparency uses an opaque system surface; Reduce Motion removes material
transitions. No repeating screenshots, video capture or JPEG backdrop loop is used.

Link previews are disabled in WKWebView, and its UI delegate declines native
web context menus. iOS-only link/image callout and drag suppression keeps holding
a media card from lifting a Safari preview or fetching a signed-out destination;
normal taps and native player gestures stay available.

## Validation and honest limits

CI uses a local HTTPS fixture trusted only in its iPhone and iPad simulators,
including a required Authorization header, byte-range playback, saved-position
startup and native JPEG preview generation. This is not a production TLS bypass.
The synthetic seven-second fixture has red, green and blue scenes, with narrow
black stripes along the top to measure native glass smoothing against unblurred
video. The test
checks a green rendered frame after resuming at 1.5 seconds, then a blue JPEG
from the independent preview decoder at 6 seconds while playback stays paused.
It checks immediate cached reuse, native surface drag/paused-state preservation,
volume sliders, Back, and glass coloration over the actual VLC scene.
Pure native tests cover URL/header validation, origin scoping, cache limits,
request parsing, HLS/DASH rewriting, real loopback range delivery and CDN scoping.

Before wider use, re-sign/install on physical iPhone and iPad and verify:

- Sign in, relaunch, sign out, change server, and verify cookie isolation.
- MP4/MKV/HLS/DASH, embedded audio/text/bitmap subtitles and external subtitles.
- Resume without an initial-frame flash, fine/fast scrubbing, cache hits,
  rapid source changes, expired URLs, cancellation, and all fit modes.
- Portrait/landscape, narrow/wide iPad windows, pointer/keyboard operation,
  safe areas, edge navigation, and two scenes taking playback ownership.
- Calls, headphones, background/foreground, memory and battery during long plays.

Simulator compilation/tests cannot establish physical-device decoder performance,
HDR correctness, PiP, AirPlay, or energy usage. Those remain separate follow-up
validation gates. The dependency and UI adapter are deliberately replaceable.
