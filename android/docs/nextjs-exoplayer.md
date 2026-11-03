# Next.js, WebView and ExoPlayer integration

Reviewed 2026-11-02. This documents the Android implementation on this branch,
including its Kotlin migration and a focused performance review. It is not a
claim of measured frame-rate, startup-time or battery improvement.

## Ownership and data flow

Navigator Android loads the hosted Next.js application in a WebView. The website
owns catalog metadata, stream resolution, authentication, routing and React
controls. Android owns Media3 ExoPlayer, its HDR SurfaceView, audio focus, native
gestures and lifecycle cleanup. There is no embedded Next.js/Node server in this
app. The configured HTTPS website and its API routes must remain reachable.

1. `MainActivity.kt` installs `bridge.js` before the trusted document starts.
   Only the exact configured HTTPS origin and the main frame can send commands.
2. `lib/desktop/bridge.ts` exposes the shared protocol. Its historical
   `navigatorDesktop` name also covers Android, where `platform` is `android`
   and `engine` is `exoplayer`.
3. `lib/desktop/mpv-controller.ts` adapts that protocol to the media element
   interface used by the existing player. Despite its name, it also drives
   Android. Its session identifiers discard stale events after source changes.
4. A `load` includes the resolved media URL, addon headers and resume position
   in **seconds**. `NativePlayer.kt` validates it and supplies milliseconds to
   `setMediaItem` before `prepare`, avoiding a separate startup resume seek.
5. `NativePlayer` emits state, track, subtitle, readiness and error events.
   The React controls render above native video; they do not decode a second
   HTML video stream. Embedded bitmap subtitles stay native, and text cues
   cross the bridge.
6. `onStop` saves position/preferences, closes preview work and releases the
   player/decoders. `onStart` recreates the active source at the saved position.
   `loaded` is published only once per media session, so returning from the
   background does not reapply the original resume position.

The bridge retains its wire protocol. Kotlin is a maintainability change; the
language conversion alone does not make ExoPlayer decode faster.

## Examples and integration rules

### Keep navigation in Next.js

Use `<Link>` or the Next.js router for application navigation. A native
`webView.loadUrl` for each media route would reload the document, destroy React
state and reset the playback bridge. Native `loadUrl` remains appropriate for
initial startup, retry and changing the trusted server.

```tsx
import Link from 'next/link';

export function EpisodeLink() {
  return <Link href="/series/tt1442437/6/4">Open episode</Link>;
}
```

Next.js supports `pushState`/`replaceState` and synchronizes them with its router
hooks. `back-navigation.js` observes history calls without adding entries or
replacing Next.js's history state. Android's Back callback first dismisses an
open overlay, then closes playback, then traverses page history.

Prefetch policy belongs to the web catalog, not a second native HTTP fetch.
Next.js prefetching is production behavior; compare production route transitions
when measuring it. For large catalogs, check request volume before expanding
prefetching to every offscreen item.

### Observe native state from a client component

This example only observes the existing player; it does not create another
controller or start another decoder. The server render remains browser-safe,
and the subscription is removed when the component unmounts.

```tsx
'use client';

import { useEffect, useState } from 'react';
import { desktopBridge } from '@/lib/desktop/bridge';

export function NativePlaybackStatus() {
  const [status, setStatus] = useState('');

  useEffect(() => {
    const bridge = desktopBridge();
    if (bridge?.engine !== 'exoplayer') return;
    return bridge.subscribe(message => {
      if (message.type !== 'state') return;
      setStatus(message.state.buffering ? 'Buffering' :
        message.state.paused ? 'Paused' : 'Playing');
    });
  }, []);

  return <span aria-live="polite">{status}</span>;
}
```

Playback commands must continue through the existing controller and its current
session. For reference, the native wire request has this shape:

```json
{
  "type": "load",
  "session": "new-unique-session",
  "url": "https://media.example/video.m3u8",
  "startPosition": 83.5
}
```

Do not log stream URLs, cookies or authorization headers. A client component must
not contain server credentials. Headers are supplied only for the selected addon
stream, validated, and restricted during redirects by `ScopedHttp.kt`.

### Configure native playback once per active source

The implementation uses the equivalent of this Media3 construction:

```kotlin
val owner = ExoPlayer.Builder(context)
    .setTrackSelector(trackSelector)
    .setMediaSourceFactory(DefaultMediaSourceFactory(dataSourceFactory()))
    .build()
owner.setVideoSurfaceView(surface)
owner.setMediaItem(MediaItem.fromUri(streamUri), resumePositionMs)
owner.prepare()
owner.playWhenReady = true
// The lifecycle owner later calls owner.release().
```

Keep all player operations on the application/main looper. Moving these calls
into arbitrary Kotlin coroutines or IO workers would violate player threading.
Only bitmap compression runs on dedicated workers here. Retain the
SurfaceView for HDR; the small SDR JPEGs used by glass/seek previews are separate
UI assets, not the playing video.

## Performance review

| Area | Finding and decision |
| --- | --- |
| State IPC | Implemented: compare a complete typed snapshot before constructing JSON. Event callbacks and the 250 ms poll no longer send identical snapshots repeatedly. Position, duration, buffer, seek, volume, mute, speed and geometry changes still publish immediately. A document's `hello` forces a fresh snapshot, and player release clears the previous one. |
| Track scanning | Implemented: only scan for selected video while waiting for readiness. The former event path scanned groups after every event even once ready. |
| Progress cadence | Retained: 4 Hz native progress updates plus immediate changes. Do not publish per-display-frame progress through the bridge. Native scrub movement is already coalesced to one update per animation frame. |
| Networking | Retained: one base OkHttp pool is shared by the playback/preview clients. Redirect interception prevents credential forwarding to other origins and HTTPS downgrade. Media3's newer HttpEngine recommendation is a candidate for a separate measured change; preserve these security rules before replacing OkHttp. |
| Byte reuse | Retained: the player and preview decoder share a bounded 96 MiB disk cache. Keys include the session to avoid reusing credential-sensitive bytes across sessions. The cache is on the Android device, not Vercel. Avoid `FLAG_BLOCK_ON_CACHE`: preview writes must not hold up playback. |
| Preview work | Retained: one extractor, bounded encoding queue, 256 px-high SDR frames, 16 MiB image cache, nearby buffered-only prewarming, explicit seek priority, duty-cycle rest and decoder timeout/release. Trace this work before increasing dimensions or prewarming farther ahead. |
| Glass sampling | Retained: small PixelCopy buffers, reuse, compression off the UI thread, unchanged paused-frame detection, and work-dependent delays. Do not move full-resolution video into canvas to blur controls. |
| Routing/hydration | Retained: the persistent Next.js document and shared layout. No native duplicate catalog fetch or wholesale reload for SPA routes. Further improvements require a trace of actual route/network/hydration costs. |

The relay regression tests model 240 identical paused polls: they deliver one
snapshot instead of 240, while changing state is delivered without debounce.
That is a message-count regression check, not a physical-device benchmark.
Buffer growth while paused is a real state change and still emits updates.

The next useful measurements are cold start to first visible web content,
play-to-first-frame, native state messages/second, preview decode/encode time,
and frame timing during a long catalog fling. Capture comparable runs on a
physical device with the same stream, network and installed WebView version.
Profile with and without glass/prewarming before changing their budgets. An APK,
device playback, HDR, gesture feel and battery usage were not tested for this PR.

## Local verification

Kotlin 2.3.21 is pinned alongside the existing AGP 8.13.2 and Gradle 8.13;
Java and Kotlin both target JVM 17. Media3 remains pinned to 1.11.1. Production
app sources are Kotlin; the existing 41 Java unit tests remain as behavioral and
Java/Kotlin interoperability coverage. Five Kotlin relay tests cover the new
state optimization.

With JDK 17 or 21 and the existing Android SDK configured:

```sh
cd android
./gradlew compileDebugKotlin testDebugUnitTest lintDebug
```

From the repository root, with normal JavaScript dependencies installed:

```sh
node scripts/test-android-bridge.cjs
node scripts/test-android-navigation.cjs
node scripts/test-android-player-ui.cjs
node scripts/test-android-web-scrub.cjs
node scripts/test-previews.cjs
```

These commands do not assemble an APK. GitHub Actions remain disabled; request a
local package build separately when a device build is wanted.

## Official documentation and examples reviewed

- [Kotlin Gradle/AGP compatibility and JVM target alignment](https://kotlinlang.org/docs/gradle-configure-project.html)
- [Media3 getting started, Kotlin examples, threading and release](https://developer.android.com/media/media3/exoplayer/hello-world)
- [Media3 player events, grouped callbacks and seek events](https://developer.android.com/media/media3/exoplayer/listening-to-player-events)
- [Media3 network stacks and shared connection pools](https://developer.android.com/media/media3/exoplayer/network-stacks)
- [Next.js navigation, Link, prefetching and persistent client transitions](https://nextjs.org/docs/app/getting-started/linking-and-navigating)
- [Next.js official history API examples](https://github.com/vercel/next.js/blob/canary/docs/01-app/01-getting-started/04-linking-and-navigating.mdx)

The choices in the review table are conclusions from comparing those docs with
Navigator's code, rather than guarantees made by those documentation pages.
