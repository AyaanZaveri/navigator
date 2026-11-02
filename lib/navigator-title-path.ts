import { buildEpisodePath, parseSeriesRouteId } from "@/lib/series-route";

export function navigatorTitlePath(id: string, type: string, season?: number, episode?: number): string | undefined {
    const normalized = type.toLowerCase();
    if (!["movie", "series", "episode"].includes(normalized)) return undefined;
    const parsed = normalized === "episode" ? parseSeriesRouteId(id) : null;
    const base = parsed?.seriesId || id;
    const seasonNumber = season ?? parsed?.season, episodeNumber = episode ?? parsed?.episode;
    if (/^tmdb:[1-9]\d*$/.test(base)) {
        const params = new URLSearchParams({ id: base, type: normalized === "movie" ? "movie" : "series" });
        if (seasonNumber !== undefined && episodeNumber !== undefined) {
            params.set("season", String(seasonNumber)); params.set("episode", String(episodeNumber));
        }
        return `/api/navigator/title?${params}`;
    }
    if (normalized === "episode" && seasonNumber !== undefined && episodeNumber !== undefined) return buildEpisodePath(base, seasonNumber, episodeNumber);
    return `/${normalized === "movie" ? "movie" : "series"}/${encodeURIComponent(base)}`;
}
