import type { MediaItem } from "@/types/stremio";
import type { MediaToPlay } from "@/lib/atoms";
import { playbackDetailsId } from "./playback-details";

export async function fetchPlaybackDetails(media: MediaToPlay, signal?: AbortSignal): Promise<MediaItem | null> {
  const params = new URLSearchParams({ id: playbackDetailsId(media), type: media.type });
  if (media.seasonNumber !== undefined && media.episodeNumber !== undefined) {
    params.set("season", String(media.seasonNumber));
    params.set("episode", String(media.episodeNumber));
  }
  const response = await fetch(`/api/playback/details?${params}`, {
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!response.ok) return null;
  return ((await response.json()) as { details?: MediaItem | null }).details || null;
}
