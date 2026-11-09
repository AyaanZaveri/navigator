import type { StremioStream } from "@/types/stremio";
import { getWebPlaybackElement } from "@/lib/media/playback-source";
import { installAudioLanguagePreference, preferredAudioTrack } from "@/lib/media/audio-language";
import { metadataAudioSupport } from "@/lib/media/stream-codecs";
import type { StreamMetadata } from "@/lib/media/stream-metadata";
import { WEB_STREAM_CHECK_TIMEOUT_MS } from "@/lib/media/playback-limits";

type ProbeVideo = HTMLVideoElement & {
  webkitVideoDecodedByteCount?: number;
  webkitAudioDecodedByteCount?: number;
  nativeEl?: HTMLVideoElement;
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
};

export type Playability = "supported" | "unsupported" | "unknown";

/** Positive startup + audio-track evidence; proprietary counters are optional. */
export function verifyMediaElementPlayback(
  video: ProbeVideo,
  signal: AbortSignal,
  timeoutMs = WEB_STREAM_CHECK_TIMEOUT_MS,
  metadata?: Promise<StreamMetadata | undefined>,
  trackOptions: { preferredAudioLanguage?: string; onAudioLanguage?: (_language: string) => void } = {},
): Promise<Playability> {
  return new Promise((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let captured: MediaStream | undefined;
    const observedTracks = new Set<MediaStreamTrack>();
    let audioMetadata: Playability = "unknown";
    let trackMetadata: StreamMetadata | undefined;
    let playing = false;
    const baseline = video.currentTime || 0;
    const clean = () => {
      if (timer !== undefined) clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      video.removeEventListener("error", onError);
      video.removeEventListener("timeupdate", inspect);
      video.removeEventListener("loadeddata", inspect);
      video.removeEventListener("loadedmetadata", inspect);
      video.removeEventListener("playing", onPlaying);
      captured?.removeEventListener("addtrack", onTracksChanged);
      for (const track of observedTracks) {
        track.removeEventListener("unmute", inspect);
        track.removeEventListener("mute", inspect);
        track.removeEventListener("ended", inspect);
      }
      for (const track of captured?.getTracks() || []) track.stop();
      try { video.pause(); } catch { /* noop */ }
      video.removeAttribute("src");
      try { video.load(); } catch { /* noop */ }
      video.remove();
    };
    const finish = (result: Playability) => {
      if (settled) return;
      settled = true;
      clean();
      resolve(result);
    };
    const onAbort = () => finish("unknown");
    const onError = () => {
      const code = video.error?.code;
      // A network failure is not proof that this browser lacks codec support.
      finish(code === 3 || code === 4 ? "unsupported" : "unknown");
    };
    const watchTracks = () => {
      for (const track of captured?.getTracks() || []) {
        if (observedTracks.has(track)) continue;
        observedTracks.add(track);
        track.addEventListener("unmute", inspect);
        track.addEventListener("mute", inspect);
        track.addEventListener("ended", inspect);
      }
    };
    const onTracksChanged = () => { watchTracks(); inspect(); };
    const onPlaying = () => { playing = true; inspect(); };
    function inspect() {
      if (settled || signal.aborted) return;
      const decoder = (video.nativeEl ?? video) as ProbeVideo;
      type TrackView = { enabled?: boolean; language?: string; lang?: string; label?: string };
      const tracks = (video as unknown as { audioTracks?: ArrayLike<TrackView> }).audioTracks
        || (decoder as unknown as { audioTracks?: ArrayLike<TrackView> }).audioTracks;
      const enabledTracks = tracks ? Array.from(tracks).filter(track => track.enabled) : [];
      const selectedTrack = preferredAudioTrack(enabledTracks, trackOptions.preferredAudioLanguage) || enabledTracks[0];
      const declaredLanguage = selectedTrack?.language || selectedTrack?.lang;
      const selectedLanguage = declaredLanguage && !/^(und|unknown|zxx)$/i.test(declaredLanguage) ? declaredLanguage
        : selectedTrack && preferredAudioTrack([selectedTrack], trackOptions.preferredAudioLanguage) ? trackOptions.preferredAudioLanguage || "en" : undefined;
      if (selectedLanguage) trackOptions.onAudioLanguage?.(selectedLanguage);
      if (trackMetadata) {
        audioMetadata = metadataAudioSupport(trackMetadata, mime => Boolean(decoder.canPlayType?.(mime)), selectedLanguage);
      }
      if (!captured) {
        try {
          // Capture the element's own output, never a microphone or screen.
          // Per the capture-from-element spec, element.muted does not mute
          // captured audio. Track.muted indicates unavailable content instead.
          const capture = decoder.captureStream ?? decoder.mozCaptureStream;
          captured = capture?.call(decoder);
          captured?.addEventListener("addtrack", onTracksChanged);
          watchTracks();
        } catch { /* Unsupported/CORS-restricted capture: use other evidence. */ }
      }
      const active = (track: MediaStreamTrack) => track.readyState === "live" && !track.muted && track.enabled;
      let frames = Number((decoder as ProbeVideo).webkitVideoDecodedByteCount ?? 0) > 0;
      try { frames ||= Number(decoder.getVideoPlaybackQuality?.().totalVideoFrames ?? 0) > 0; } catch { /* unavailable */ }
      frames ||= playing && Boolean(captured?.getVideoTracks().some(active));
      frames ||= playing && decoder.readyState >= 2 && decoder.videoWidth > 0 && decoder.videoHeight > 0
        && decoder.currentTime - baseline > 0.05;
      const audio = Number(decoder.webkitAudioDecodedByteCount ?? 0) > 0
        || Boolean(captured?.getAudioTracks().some(active)) || audioMetadata === "supported";
      if (frames && audio) finish("supported");
    }

    if (signal.aborted) { finish("unknown"); return; }
    signal.addEventListener("abort", onAbort, { once: true });
    video.addEventListener("error", onError);
    video.addEventListener("timeupdate", inspect);
    video.addEventListener("loadeddata", inspect);
    video.addEventListener("loadedmetadata", inspect);
    video.addEventListener("playing", onPlaying);
    // Cached metadata may describe a different default/selected track. Give
    // actual playback evidence the whole probe window to override a negative.
    timer = setTimeout(() => finish(audioMetadata === "unsupported" ? "unsupported" : "unknown"), timeoutMs);
    void metadata?.then(value => {
      if (settled || signal.aborted) return;
      // A nonempty, browser-supported audio track plus real video startup is
      // useful even where capture/counter APIs are unavailable (e.g. Safari).
      trackMetadata = value;
      inspect();
    }).catch(() => { /* Missing metadata is inconclusive, not no-audio evidence. */ });
    Promise.resolve().then(() => settled ? undefined : video.play()).then(() => {
      if (!settled) onPlaying();
    }, () => finish("unknown"));
  });
}

export async function probeStreamPlayability(
  stream: StremioStream,
  options: { signal: AbortSignal; timeoutMs?: number; preferredAudioLanguage?: string; metadata?: Promise<StreamMetadata | undefined>; onAudioLanguage?: (_language: string) => void },
): Promise<Playability> {
  const src = stream.url || stream.externalUrl;
  if (!src || options.signal.aborted || typeof document === "undefined"
    || Object.keys(stream.behaviorHints?.proxyHeaders?.request || {}).length) return "unknown";

  let video: ProbeVideo;
  if (getWebPlaybackElement(src) === "mux") {
    try {
      // Match the application's Mux-backed playback path for HLS/MP4.
      await import("@mux/mux-video");
      if (options.signal.aborted) return "unknown";
      const mux = document.createElement("mux-video") as ProbeVideo;
      video = mux;
    } catch {
      // Do not use playlist fetching or native-HLS metadata as proof.
      return "unknown";
    }
  } else {
    video = document.createElement("video") as ProbeVideo;
  }
  video.preload = "auto";
  video.crossOrigin = "anonymous";
  video.playsInline = true;
  video.muted = true;
  video.setAttribute("playsinline", "");
  video.setAttribute("muted", "");
  video.setAttribute("disable-tracking", "");
  video.setAttribute("aria-hidden", "true");
  video.tabIndex = -1;
  // Keep probes connected for media engines that require it, without showing
  // five miniature players or making them keyboard/screen-reader targets.
  video.style.cssText = "position:fixed;width:1px;height:1px;clip-path:inset(100%);pointer-events:none;";
  document.body.append(video);
  const removeLanguagePreference = installAudioLanguagePreference(video, options.preferredAudioLanguage);
  const result = verifyMediaElementPlayback(video, options.signal, options.timeoutMs ?? WEB_STREAM_CHECK_TIMEOUT_MS, options.metadata, options);
  if (!options.signal.aborted) video.src = src;
  return result.finally(removeLanguagePreference);
}
