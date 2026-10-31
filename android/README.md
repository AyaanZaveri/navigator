# Navigator for Android

The full Navigator Next.js website in an Android WebView, with native **Media3
ExoPlayer** video on a **SurfaceView** underneath the existing React player UI.
The WebView is transparent during playback and opaque while browsing.
This uses the same layering and HDR path verified on the user's phone with the
separate SDR/HDR10/HLG demo. The website remains hosted; no Node.js server or API
keys are bundled in the APK.

## Install and test

Download **Navigator-Android.apk** from the **Android APK** workflow's artifact
or job summary. The workflow uses `actions/upload-artifact@v7.0.2` with
`archive: false`: the download is the APK itself, without an outer ZIP.
GitHub requires sign-in to download workflow artifacts.

The application ID is `app.navigator.android`, distinct from the demo app.
Android 7.0+ and an up-to-date Android System WebView are required. Sign in to
Navigator normally, configure any provider/artwork credentials in the existing
Settings page, and play a title. The default server is
`https://navigator-strm.vercel.app`.

The APK already works with the currently deployed desktop media bridge contract,
so testing does not require merging this PR. New web UI additions (the explicit
Android close event and **App settings** avatar-menu entry) appear when this PR's
web changes are deployed; the app includes an existing-player Back-button fallback.

Test on a physical device:

1. Sign in; browse/search, choose a stream, and verify that native video plays
   behind the existing controls and artwork/loading UI.
2. Pause/resume, seek, change speed, mute/adjust volume, and verify saved progress.
3. Try direct MP4/MKV, HLS, and DASH sources, including addon request headers.
4. Switch embedded audio/subtitle tracks; try external subtitles from Navigator.
5. Play HDR10/PQ and HLG content on an HDR-capable device. Video remains on the
   native surface throughout; no frames are copied through canvas/WebView.
6. Rotate, enter/exit fullscreen, and use Android Back from either edge. One
   committed Back closes playback, including immersive fullscreen. On a detail
   page, drag Back partway and cancel (the page must remain), then commit to
   return through the actual page history. Open the account sheet and verify
   Back dismisses it before navigating. At the root, Android owns back-to-home.
7. Background and reopen the app. It releases playback in the background and
   restores the active source, position, playback preferences, and selected
   tracks when returning. Unplug headphones, change titles quickly, close during
   buffering, retry an expired stream, log out, and relaunch to verify cleanup.

To change server, use **App settings** in the avatar menu, or long-press the app
icon in the Android launcher and choose **App settings**. The connection-error
screen also provides this button. Only an HTTPS origin (no path, query, or
embedded credentials) is accepted. Changing it stops playback and moves the
privileged bridge to that exact origin. Account cookies stay scoped to their
respective website origins.

## Build

Requirements: JDK 17 or 21, Android SDK Platform 36 and Build Tools 36.0.0.
Set `JAVA_HOME` and `ANDROID_HOME`, or set `sdk.dir` in a gitignored
`android/local.properties`. Gradle 8.13 is pinned and checksum-verified.

```sh
cd android
./gradlew testDebugUnitTest lintDebug assembleDebug
```

Output: `app/build/outputs/apk/debug/app-debug.apk`.
No web build or running development server is needed.

For a different trusted Navigator server:

```sh
./gradlew assembleDebug -PnavigatorUrl=https://your-navigator.example
```

Test builds use the checked-in **public development keystore** (password
`android`), keeping updates installable across local and GitHub builds. This is
deliberately a development signing identity, not a production signing secret.
Use a private signing identity for a store/release build. Version codes default
to build-time epoch minutes so newer test builds can update older ones; an
explicit `-PversionCode=...` can override this.

## Validation and workflow

```sh
# From the repository root:
node scripts/test-android-bridge.cjs
node scripts/test-android-navigation.cjs
node scripts/test-android-player-ui.cjs
node scripts/test-desktop.cjs
npx tsc --noEmit
```

The Android bridge test checks origin/frame isolation, event subscriptions,
fullscreen, playback visibility, reload cleanup, and compatibility with the
deployed React player. JVM tests use real local HTTP requests/redirects to check
stream header propagation and prevent addon credentials crossing origins. The
Gradle job runs unit tests, Android lint, assembles/signs the APK, verifies its
signature, then uploads one raw APK with a direct link in the job summary.

No emulator is used or started. The full application's device integration and
HDR panel output await the user's physical-device testing; the earlier demo's
SDR, HDR10, and HLG tests were confirmed working by the user.

## Playback and bridge details

- AndroidX edge-to-edge keeps the WebView/background underneath transparent
  system bars. Insets pass through unconsumed and are also sent as CSS-pixel
  values to the document for older WebView compatibility. Only the header,
  app content, and fixed controls receive safe spacing; the background/video
  stays full-window. System icon appearance follows the web page's theme.
  The home-indicator/navigation area is explicitly transparent, including legacy
  navigation-bar scrims/dividers. Bottom safe spacing belongs to scroll content
  and fixed controls, so it does not create a stationary empty strip. Fullscreen
  exit preserves the edge-to-edge layout flags on older Android versions.
- Normal startup uses the AndroidX Navigator splash until the first web frame
  is ready. Retry/App settings appear only for an actual load failure or a
  30-second no-content timeout, rather than on every page load.
- ExoPlayer 1.11.1 uses Android's MediaCodec/SurfaceView path. The window opts
  into HDR on API 26+, while ExoPlayer handles source color metadata and device
  decoder selection. Hardware, codec, and format support remain device-dependent.
- Native state follows the existing protocol-1 `navigatorDesktop` contract.
  The historic mpv/controller filenames and `data-desktop="mpv"` marker remain
  compatible; Android identifies itself as `platform: "android"` and
  `engine: "exoplayer"`. The browser player and desktop mpv backend are unchanged.
- Touch taps toggle controls without pausing; mouse clicks retain play/pause.
  Controls fade out after three idle seconds with the existing 200 ms ease-out
  opacity transition (100 ms with reduced motion). Pausing, active sliders,
  keyboard focus, and open menus keep them available. The APK includes an
  origin-scoped compatibility controller for the currently deployed website;
  it disables itself when the updated React player declares `data-touch-controls`.
  Native progress messages and React rerenders do not reset idle timers.
- Text cues go to the existing blurred React subtitle overlay; bitmap cues use
  a native SubtitleView aligned to the video. External subtitles continue through
  Navigator's existing UI/server flow. Media3's text styling/codec support may
  differ from mpv/libass; full ASS styling is not added by this integration.
- Stream sessions reject stale commands/events. Replacing a source releases its
  previous player. Backgrounding releases codecs/audio and pauses WebView work;
  no background service or picture-in-picture behavior is introduced here.
- HTTP media is allowed for addon compatibility; the privileged website must be
  HTTPS. OkHttp sends addon headers to the stream origin, permits public
  User-Agent/Referer/Origin hints on CDN requests, strips other addon headers on
  cross-origin requests/redirects, and refuses HTTPS-to-HTTP media downgrades.
  Addons requiring credentials on a separate CDN origin need explicit future
  support; website account cookies are never automatically sent to the player.
- Only the selected origin receives the document-start bridge. Subframes and
  foreign origins cannot issue player commands. Other HTTP(S) navigation opens
  the system browser. File/content navigation and SSL-error bypasses are disabled.
- HTML timeline hover previews retain their browser fallback, which depends on
  WebView format support. Hidden-controls swipe scrubbing uses the separate native
  keyframe extractor described below; it never seeks the playing decoder to
  generate previews.

### Player typography and side gestures

The player uses the shorter visible label **Back**, with the accessible name
**Back to browsing**, a 44 px touch target, and a 16 px base inset plus actual
camera/corner clearance. Mobile/coarse-pointer titles use a 24 px heading and
14 px metadata with natural wrapping; timer digits use tabular figures. The
title, timeline, and toolbar share a 24 px gutter that expands only where the
camera overlaps the measured control band. Narrow layouts wrap toolbar groups
and allow vertical scrolling at large text sizes. Desktop keeps the denser
layout. Matching loading typography and injected hosted-UI hooks apply in the
APK before deployment. Resize observations report geometry only when it changes;
progress text never triggers layout measurements or extra bridge traffic.

During Android playback, swipe vertically in the full left third to adjust
app-window brightness, or the full right third to adjust **Android media volume**.
Up increases and down decreases. Transparent vertical bars copy the timeline's
6 dp rounded track, white fill and 20% white unfilled track, without a thumb or
background panel. The invisible drag target remains 56 dp wide; the volume bar
uses a single 18 dp Lucide icon above the bar. It changes between VolumeX,
Volume, Volume1 and Volume2 as the level changes; tapping that icon toggles mute.
Brightness uses Lucide Sun at the same size. Official SVG geometry is packaged
as Android vectors with the pinned source revision and ISC license included.
There is no icon below either bar. Drag either bar directly.
Vertical side swipes now need approximately the full video height for a full
range change, halving the previous sensitivity. Direct bar drags are relative
to their starting value, with at least 240 dp travel per full range, so pressing
the track does not jump the value.
The parent waits for clear directional intent, then sends `ACTION_CANCEL` to the
WebView so a swipe cannot become a tap. Visible controls and top buttons keep
their touch areas. Hidden controls release the full video height. Horizontal
swipes beginning in Android's Back region remain with the system; vertical side
swipes reach the physical edges. Multitouch and TalkBack exploration never claim
a video gesture. There are no per-move JS bridge messages.

With controls hidden, horizontal swiping seeks with a thumbnail, target time,
signed offset, and a thin progress bar. Moving toward the top slows scrubbing;
moving toward the bottom speeds it up. Incremental movement allows changing
height during one drag without jumping the target. The decoder pauses during
the gesture while preserving the logical play state, commits one seek on release,
and restores that state. Cancelling, rotating, backgrounding, or changing the
source cannot commit an old seek to a new session. Live/unseekable streams do
not enter scrub mode.

Media3 1.11.1's `media3-inspector-frame` extracts 180 px high keyframes using
`CLOSEST_SYNC` and the hardware decoder selector. A separate asynchronous decoder
uses the same origin-scoped HTTP header and redirect policy as playback. Requests
are bucketed to two seconds: one extraction runs at a time and pending movement
replaces the desired target. An 8 MB bitmap cache and one warm request when
controls hide improve responsiveness. Idle decoders release after ten
seconds, extraction times out after eight seconds, and source changes/backgrounding
clear the cache and decoder. Failed extraction leaves time and progress usable
and retries after a cooldown. The initial preview uses a loading placeholder;
a cached frame stays visible while the next frame loads. HDR inputs produce
SDR tone-mapped thumbnails; main HDR/HLG playback remains on its native surface.

Firecore documents directional seeking, side brightness/volume gestures, and live
preview thumbnails. It does not publish a numeric finger-height sensitivity curve;
Navigator's top-slow/bottom-fast curve follows the requested behavior rather than
claiming an identical Infuse algorithm. Long videos span about 30 seconds per
screen-width at the top and ten minutes at the bottom, with a smooth quadratic
blend; shorter videos scale to their duration.

Brightness uses `WindowManager.LayoutParams.screenBrightness` and restores the
previous window value, including automatic/default policy, when playback closes.
The 100% endpoint requests `BRIGHTNESS_OVERRIDE_FULL` (1.0) independently of the
phone's preferred brightness. Every gesture reasserts its override and each update writes the requested
absolute value, including an unchanged maximum; unchanged LayoutParams values
can outlive a manual display adjustment. A lifecycle-bound ContentObserver watches
the public brightness and brightness-mode settings. A subsequent drag rebases
from the changed phone setting instead of a stale app maximum, then retains the
full adjustment range. Window-focus gain also reapplies the active override.
No global brightness settings are written. JVM regressions cover same-value
reassertion, manual-change/re-drag sequences, absolute requests, exact endpoints,
focus reapplication and restoration; actual panel behavior needs a device check.
Volume and mute use `AudioManager.STREAM_MUSIC` with the normal
`MODIFY_AUDIO_SETTINGS` permission. No global brightness settings or
`WRITE_SETTINGS` permission are required. Devices restricting volume are handled
without crashing. JVM tests cover gesture intent, thirds/edges, control visibility,
Back priority, reversal, bounds and changing sensitivity mid-drag. Native lint,
bridge regressions and signed APK packaging are checked without an emulator.
Actual swipe feel, preview latency, Bluetooth volume and HDR appearance still
require the user's device check.

Reaching either bar's endpoint gives one native `SEGMENT_TICK` haptic on Android
14+ (a short predefined tick), with `CLOCK_TICK` on older supported versions.
`View.performHapticFeedback` lets the device choose its tuned effect and respects
system/view haptic settings; no custom vibration waveform, forced setting or new
vibration permission is used. Holding at a limit does not repeat it. A 3% retreat
rearms the endpoint to prevent chatter from small finger movements. Starting at
a limit or cancelling the gesture does not buzz. Pure-state tests cover these
sequences; physical haptic feel requires the user's Pixel.

### Android Back and phone geometry

The app opts into predictive Back and registers its AndroidX callback only when
an overlay, native player, error surface, or WebView history needs handling.
The action order is overlay dismissal, player closure, then page history; a
fullscreen video closes in one gesture. At the root the callback is disabled,
allowing Android's system back-to-home animation.

Next.js `pushState`, `replaceState`, and `popstate` refresh the callback without
adding synthetic entries or altering framework history state. Native visited
history callbacks also cover regular document loads. Android 14+ gesture progress
scales and translates the browsing WebView directly, settling in 180 ms; cancelling
restores it without traversing history. System-disabled animations skip this
motion. Native video stays on its existing surface, and progress never crosses
the JS bridge. The hosted account menu handles dismissal through Escape; the
Ask panel supports a native event with an outside-press compatibility fallback.

On Android 12+, reported screen corner radii reach CSS. The inset account sheet's
bottom radii use the corresponding physical radius minus its 8 px horizontal gap,
and the sheet sits 16 px above the viewport bottom to keep its curve clear,
with a rounded fallback when the display does not report geometry. Content clears
the gesture inset. The player's top Back button uses actual top-corner and camera
intersection clearance instead of adding a full-height landscape cutout inset.
The injected styles also support the currently deployed UI before this PR merges.

### Browsing smoothness

Browsing uses an opaque WebView in a default SDR window, avoiding the alpha
composition and HDR window requested for video. Entering native playback restores
both before video is presented; closing playback returns to ordinary rendering.
Theme changes update the opaque background. Transparent system bars and safe
areas remain in place.

On Android 15+, document-captured CSS scroll events request the platform's HIGH
frame-rate category for the WebView. This covers the nested overflow scrollers
used throughout Navigator, including flings. It is a preference, not a forced
120 Hz display mode. One start/finish pair crosses the bridge per continuous
scroll, with a 240 ms idle delay; page changes and backgrounding reset the hint.
Native video uses its existing platform frame-rate policy. Older Android versions
keep their default refresh-rate behavior.

The bridge regression tests replay a 120 Hz scroll and verify message coalescing,
idle release, visibility changes, and disposal. These checks do not measure
physical-device frame times. Compare the same page and scroll on the Pixel with
the previous APK and the website; a device Perfetto/WebView trace is still needed
if perceptible jitter remains. No GPU effects or page content were removed.

References used:

- [Android view haptic feedback and system preference handling](https://developer.android.com/develop/ui/views/haptics/haptic-feedback)
- [Slider segment tick semantics](https://developer.android.com/reference/android/view/HapticFeedbackConstants#SEGMENT_TICK)
- [AOSP semantic haptic to predefined tick mapping](https://github.com/aosp-mirror/platform_frameworks_base/blob/main/services/core/java/com/android/server/vibrator/HapticFeedbackVibrationProvider.java)
- [Official Lucide icon geometry and license, pinned revision](https://github.com/lucide-icons/lucide/tree/a630cec77eac6568b989e87e4947a8bfe45caacd/icons)

- [Firecore playback gestures](https://support.firecore.com/hc/en-us/articles/215090987-Playback-Controls)
- [Infuse preview seeking](https://firecore.com/blog/infuse-58-seek-and-find)
- [Pinned Media3 frame extractor API, performance guidance and HDR behavior](https://github.com/androidx/media/blob/1.11.1/libraries/inspector_frame/src/main/java/androidx/media3/inspector/frame/FrameExtractor.java)

- [Media3 dependencies and releases](https://developer.android.com/jetpack/androidx/releases/media3)
- [Media3 1.11.1 API](https://github.com/androidx/media/blob/1.11.1/api.txt)
- [Media3 control visibility and timeout](https://developer.android.com/reference/androidx/media3/ui/PlayerControlView)
- [Motion easing and duration](https://m3.material.io/styles/motion/easing-and-duration/applying-easing-and-duration)
- [Player events](https://developer.android.com/media/media3/exoplayer/listening-to-player-events)
- [Track selection](https://developer.android.com/media/media3/exoplayer/track-selection)
- [Android HDR playback](https://developer.android.com/media/grow/hdr-playback)
- [Android predictive Back and ahead-of-time interception](https://developer.android.com/guide/navigation/custom-back/predictive-back-gesture)
- [Official WebView Back codelab](https://codelabs.developers.google.com/handling-gesture-back-navigation)
- [Predictive Back animation callbacks](https://developer.android.com/guide/navigation/custom-back/support-animations)
- [Window brightness override and automatic/default policy](https://developer.android.com/reference/android/view/WindowManager.LayoutParams#screenBrightness)
- [Android media stream volume](https://developer.android.com/reference/android/media/AudioManager#setStreamVolume(int,int,int))
- [Parent touch interception and child cancellation](https://developer.android.com/develop/ui/views/touch-and-input/gestures/viewgroup)
- [Physical display rounded corners](https://developer.android.com/develop/ui/views/layout/insets/rounded-corners)
- [Adaptive refresh-rate categories, touch boost, and custom scroll views](https://developer.android.com/develop/ui/views/animations/adaptive-refresh-rate)
- [Hardware acceleration and avoiding unnecessary view layers](https://developer.android.com/develop/ui/views/graphics/hardware-accel)
- [Public high-refresh Chromium/WebView scrolling report (different device/provider; not a Navigator diagnosis)](https://github.com/uazo/cromite/issues/2572)
- [Edge-to-edge views and transparent system bars](https://developer.android.com/develop/ui/views/layout/edge-to-edge)
- [WebView insets, compatibility, and avoiding double padding](https://developer.android.com/develop/ui/views/layout/webapps/understand-window-insets)
- [AndroidX splash screen migration](https://developer.android.com/develop/ui/views/launch/splash-screen/migrate)
- [WebView document-start scripts and origin-scoped messaging](https://developer.android.com/reference/androidx/webkit/WebViewCompat)
- [Raw single-file workflow artifacts](https://github.com/actions/upload-artifact#upload-an-individual-file-unzipped)

AndroidX/Media3 and OkHttp are Apache-2.0 dependencies. The app icon reuses the
user-provided Navigator artwork already in the repository.
