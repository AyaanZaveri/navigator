import { createPlaybackStreamRequest } from "./fetch-playback-streams";
import { fetchPlaybackDetails } from "./fetch-playback-details";
import { resolvePlayback } from "./resolve-playback";
import { mergePlaybackDetails, initialPlaybackDetails } from "./playback-details";
import { probeStreamMetadata } from "./stream-metadata";
import { probeStreamPlayability } from "./stream-playability";
import { readPlaybackPreferences } from "./playback-preferences";
import { NEXT_EPISODE_PREFETCH_TTL } from "./episode-continuation";
import type { MediaToPlay } from "@/lib/atoms";
import type { Episode } from "@/app/actions/tv-shows";

export async function fetchFollowingEpisode(id: string, season: number, episode: number, signal: AbortSignal): Promise<Episode | null> {
  const response = await fetch('/api/playback/next-episode?' + new URLSearchParams({ id, season: String(season), episode: String(episode) }), {
    signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]), cache: "no-store",
  });
  if (!response.ok) throw new Error('Could not find the next episode');
  return ((await response.json()) as { episode?: Episode | null }).episode || null;
}
export async function prepareNextEpisode(media: MediaToPlay, native: boolean, signal: AbortSignal, createStreams = createPlaybackStreamRequest, readDetails = fetchPlaybackDetails): Promise<MediaToPlay> {
  signal.throwIfAborted();
  const streamRequest = createStreams(media.mediaSourceId || media.id, media.type, signal);
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
      verifyStream: (stream, options) => probeStreamPlayability(stream, { signal: options.signal, preferredAudioLanguage: preferences.audioLanguage,
        metadata: options.metadata, timeoutMs: options.timeoutMs, onAudioLanguage: options.onAudioLanguage }),
    }, () => {}),
    preferences.metadataPrefetch ? readDetails(media, signal).catch(() => null) : Promise.resolve(null),
  ]);
  signal.throwIfAborted();
  return { ...resolved, details: mergePlaybackDetails(initialPlaybackDetails(media), details), detailsLoaded: Boolean(details),
    ...(!native && preferences.autoSelectWebStream && resolved.streamUrl ? {
      preparedWebStream: { url: resolved.streamUrl, audioLanguage: preferences.audioLanguage,
        headersKey: JSON.stringify(resolved.requestHeaders || {}), expires: Date.now() + NEXT_EPISODE_PREFETCH_TTL },
    } : {}),
  };
}
