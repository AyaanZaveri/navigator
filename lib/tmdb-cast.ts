import "server-only";

import { normalizeCast, type CastMember, type TMDBCastCredit } from "@/lib/cast";

async function fetchTMDB<T>(path: string, token: string): Promise<T | null> {
    try {
        const response = await fetch(`https://api.themoviedb.org/3/${path}`, {
            headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
            next: { revalidate: 86400 },
            signal: AbortSignal.timeout(3000),
        });
        return response.ok ? await response.json() as T : null;
    } catch {
        return null;
    }
}

export async function getMediaCast(id: string, type: "movie" | "series", names: string[] = []): Promise<{ members: CastMember[]; sourceUrl?: string }> {
    const fallback = { members: [...new Set(names)].slice(0, 30).map((name) => ({ id: name, name })) };
    const token = process.env.TMDB_API_READ_ACCESS_TOKEN?.trim();
    if (!token) return fallback;

    const mediaType = type === "series" ? "tv" : "movie";
    let tmdbId: number | undefined;
    const imdbId = id.split(":")[0];
    if (/^tt\d+$/.test(imdbId)) {
        const match = await fetchTMDB<{ movie_results?: { id: number }[]; tv_results?: { id: number }[] }>(
            `find/${imdbId}?external_source=imdb_id`, token,
        );
        tmdbId = (type === "series" ? match?.tv_results : match?.movie_results)?.[0]?.id;
    } else if (/^tmdb:\d+$/.test(id)) {
        tmdbId = Number(id.split(":")[1]);
    }
    if (!tmdbId || !Number.isSafeInteger(tmdbId)) return fallback;

    const result = await fetchTMDB<{ cast?: TMDBCastCredit[] }>(
        `${mediaType}/${tmdbId}/${type === "series" ? "aggregate_credits" : "credits"}?language=en-US`, token,
    );
    if (!Array.isArray(result?.cast)) return fallback;
    const members = normalizeCast(result.cast);
    return members.length ? { members, sourceUrl: `https://www.themoviedb.org/${mediaType}/${tmdbId}/cast` } : fallback;
}
