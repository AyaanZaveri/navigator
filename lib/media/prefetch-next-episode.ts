import { createPlaybackStreamRequest } from "./fetch-playback-streams";
import { fetchPlaybackDetails } from "./fetch-playback-details";
import { resolvePlayback } from "./resolve-playback";
import { mergePlaybackDetails, initialPlaybackDetails } from "./playback-details";
import { probeStreamMetadata } from "./stream-metadata";
import { probeStreamPlayability } from "./stream-playability";
import { readPlaybackPreferences } from "./playback-preferences";
import type { MediaToPlay } from "@/lib/atoms";
import type { Episode } from "@/app/actions/tv-shows";

export async function fetchFollowingEpisode(id: string, season: number, episode: number, signal: AbortSignal): Promise<Episode | null> {
  const response = await fetch('/api/playback/next-episode?' + new URLSearchParams({ id, season: String(season), episode: String(episode) }), {
    signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]), cache: "no-store",
  });
  if (!response.ok) throw new Error('Could not find the next episode');
  return ((await response.json()) as { episode?: Episode | null }).episode || null;
}
export async function prepareNextEpisode(media: MediaToPlay, native: boolean, signal: AbortSignal): Promise<MediaToPlay> {
  signal.throwIfAborted();
  const streamRequest = createPlaybackStreamRequest(media.mediaSourceId || media.id, media.type, signal);
  const preferences = readPlaybackPreferences();
  const probe = !native && preferences.autoSelectWebStream && typeof document !== "undefined" ? document.createElement("video") : null;
  const [resolved, details] = await Promise.all([
    resolvePlayback({ ...media, streamRequest }, {
      environment: native ? "native" : "web", preferredAudioLanguage: preferences.audioLanguage,
      autoSelectWebStream: preferences.autoSelectWebStream,
      signal,
      fetchStreams: () => streamRequest.promise, getNextEpisodeForSeries: async () => null,
      canPlayType: probe ? mime => Boolean(probe.canPlayType(mime)) : undefined,
      inspectStream: probe ? (stream, options) => probeStreamMetadata(stream, { signal: options.signal, budget: options.budget }) : undefined,
      verifyStream: (stream, options) => probeStreamPlayability(stream, { signal: options.signal, preferredAudioLanguage: preferences.audioLanguage }),
    }, () => {}),
    fetchPlaybackDetails(media, signal).catch(() => null),
  ]);
  signal.throwIfAborted();
  return { ...resolved, details: mergePlaybackDetails(initialPlaybackDetails(media), details), detailsLoaded: Boolean(details) };
}

export const EPISODE_OPENING_BYTES = 2 * 1024 * 1024;
/** Best-effort HTTP cache warming, never an unbounded background episode download.
 * Native decoders have separate caches: they reuse prepared streams, not this web cache.
 * Range cache reuse is governed by the origin/cache; it is not guaranteed. */
export async function warmEpisodeOpening(media: MediaToPlay, signal: AbortSignal, fetchFn: typeof fetch = fetch): Promise<number> {
  if (signal.aborted || !media.streamUrl || Object.keys(media.requestHeaders || {}).length || /\.m3u8(?:[?#]|$)/i.test(media.streamUrl)) return 0;
  const controller = new AbortController();
  const combined = AbortSignal.any([signal, controller.signal, AbortSignal.timeout(10_000)]);
  try {
    const response = await fetchFn(media.streamUrl, { headers: { Range: `bytes=0-${EPISODE_OPENING_BYTES - 1}` }, signal: combined, cache: "default", credentials: "omit" });
    const length = Number(response.headers.get("Content-Length"));
    if (response.status !== 206 || !response.body || length > EPISODE_OPENING_BYTES) { await response.body?.cancel(); return 0; }
    const range = response.headers.get("Content-Range");
    if (range && !/^bytes 0-\d+\/\d+$/.test(range)) { await response.body.cancel(); return 0; }
    const reader = response.body.getReader();
    let bytes = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) return bytes;
      bytes += chunk.value.byteLength;
      if (bytes > EPISODE_OPENING_BYTES) { await reader.cancel(); return 0; }
    }
  } catch { return 0; }
  finally { controller.abort(); }
}
