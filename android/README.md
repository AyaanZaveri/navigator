# Navigator for Android

The full Navigator Next.js website in an Android WebView, with native **Media3
ExoPlayer** video on a **SurfaceView** underneath the existing React player UI.
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
6. Rotate, enter/exit fullscreen, and press Android Back. Back exits immersive
   fullscreen first, then closes playback and returns to the underlying page.
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
- Scrubber preview requests return promptly to the existing browser preview
  fallback. Android does not add a second native frame extractor or seek the
  playing decoder to generate previews. Formats unsupported by WebView may have
  no hover thumbnail, even when native playback works.

References used:

- [Media3 dependencies and releases](https://developer.android.com/jetpack/androidx/releases/media3)
- [Media3 1.11.1 API](https://github.com/androidx/media/blob/1.11.1/api.txt)
- [Player events](https://developer.android.com/media/media3/exoplayer/listening-to-player-events)
- [Track selection](https://developer.android.com/media/media3/exoplayer/track-selection)
- [Android HDR playback](https://developer.android.com/media/grow/hdr-playback)
- [Edge-to-edge views and transparent system bars](https://developer.android.com/develop/ui/views/layout/edge-to-edge)
- [WebView insets, compatibility, and avoiding double padding](https://developer.android.com/develop/ui/views/layout/webapps/understand-window-insets)
- [AndroidX splash screen migration](https://developer.android.com/develop/ui/views/launch/splash-screen/migrate)
- [WebView document-start scripts and origin-scoped messaging](https://developer.android.com/reference/androidx/webkit/WebViewCompat)
- [Raw single-file workflow artifacts](https://github.com/actions/upload-artifact#upload-an-individual-file-unzipped)

AndroidX/Media3 and OkHttp are Apache-2.0 dependencies. The app icon reuses the
user-provided Navigator artwork already in the repository.
