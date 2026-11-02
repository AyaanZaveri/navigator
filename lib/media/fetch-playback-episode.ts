import type { Episode } from "@/app/actions/tv-shows";

/** Fetch only the episode being played, independently of navigation and Server Actions. */
export async function fetchPlaybackEpisode(id: string, season: number, episode: number, signal?: AbortSignal): Promise<Episode | null> {
    const response = await fetch("/api/playback/episode?" + new URLSearchParams({ id, season: String(season), episode: String(episode) }), {
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000),
    });
    if (!response.ok) return null;
    const data = await response.json() as { episode?: Episode | null };
    return data.episode || null;
}
