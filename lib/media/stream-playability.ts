import type { StremioStream } from "@/types/stremio";
import { getWebPlaybackElement } from "@/lib/media/playback-source";
import { installAudioLanguagePreference } from "@/lib/media/audio-language";

type ProbeVideo = HTMLVideoElement & {
  webkitVideoDecodedByteCount?: number;
  webkitAudioDecodedByteCount?: number;
  nativeEl?: HTMLVideoElement;
};

export type Playability = "supported" | "unsupported" | "unknown";

/** Check actual decoding evidence, not metadata readiness. Exported for deterministic tests. */
export function verifyMediaElementPlayback(
  video: ProbeVideo,
  signal: AbortSignal,
  timeoutMs = 4000,
): Promise<Playability> {
  return new Promise((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const clean = () => {
      if (timer !== undefined) clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      video.removeEventListener("error", onError);
      video.removeEventListener("timeupdate", inspect);
      video.removeEventListener("loadeddata", inspect);
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
      finish(code && code >= 2 && code <= 4 ? "unsupported" : "unknown");
    };
    function inspect() {
      if (settled || signal.aborted) return;
      const decoder = video.nativeEl ?? video;
      let frames = Number((decoder as ProbeVideo).webkitVideoDecodedByteCount ?? 0) > 0;
      try { frames ||= Number(decoder.getVideoPlaybackQuality?.().totalVideoFrames ?? 0) > 0; } catch { /* unavailable */ }
      const audio = Number((decoder as ProbeVideo).webkitAudioDecodedByteCount ?? 0) > 0;
      // No reliable audio-decode counter means no positive support claim.
      if (frames && audio) finish("supported");
    }

    if (signal.aborted) { finish("unknown"); return; }
    signal.addEventListener("abort", onAbort, { once: true });
    video.addEventListener("error", onError);
    video.addEventListener("timeupdate", inspect);
    video.addEventListener("loadeddata", inspect);
    timer = setTimeout(() => finish("unknown"), timeoutMs);
    Promise.resolve().then(() => settled ? undefined : video.play()).then(inspect, () => finish("unknown"));
  });
}

export async function probeStreamPlayability(
  stream: StremioStream,
  options: { signal: AbortSignal; timeoutMs?: number; preferredAudioLanguage?: string },
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
  video.playsInline = true;
  video.muted = true;
  video.setAttribute("playsinline", "");
  video.setAttribute("muted", "");
  video.setAttribute("aria-hidden", "true");
  video.tabIndex = -1;
  // Keep probes connected for media engines that require it, without showing
  // five miniature players or making them keyboard/screen-reader targets.
  video.style.cssText = "position:fixed;width:1px;height:1px;clip-path:inset(100%);pointer-events:none;";
  document.body.append(video);
  const removeLanguagePreference = installAudioLanguagePreference(video.nativeEl ?? video, options.preferredAudioLanguage);
  const result = verifyMediaElementPlayback(video, options.signal, options.timeoutMs ?? 4000);
  if (!options.signal.aborted) video.src = src;
  return result.finally(removeLanguagePreference);
}
