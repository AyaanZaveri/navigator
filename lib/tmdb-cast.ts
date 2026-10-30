import "server-only";

import { normalizeCast, type CastMember, type TMDBCastCredit } from "@/lib/cast";
import { fetchTMDB, resolveTMDBId } from "@/lib/tmdb";

export async function getMediaCast(id: string, type: "movie" | "series", names: string[] = []): Promise<{ members: CastMember[]; sourceUrl?: string }> {
    const fallback = { members: [...new Set(names)].slice(0, 30).map((name) => ({ id: name, name })) };
    const token = process.env.TMDB_API_READ_ACCESS_TOKEN?.trim();
    if (!token) return fallback;

    const mediaType = type === "series" ? "tv" : "movie";
    const tmdbId = await resolveTMDBId(id, type, token);
    if (!tmdbId) return fallback;

    const result = await fetchTMDB<{ cast?: TMDBCastCredit[] }>(
        `${mediaType}/${tmdbId}/${type === "series" ? "aggregate_credits" : "credits"}?language=en-US`, token,
    );
    if (!Array.isArray(result?.cast)) return fallback;
    const members = normalizeCast(result.cast);
    return members.length ? { members, sourceUrl: `https://www.themoviedb.org/${mediaType}/${tmdbId}/cast` } : fallback;
}
