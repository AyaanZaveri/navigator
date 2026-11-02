export type SkipSegmentKind = "intro" | "recap" | "credits";
export interface SkipSegment {
    kind: SkipSegmentKind;
    start: number;
    end: number;
    provider: "theintrodb" | "introdb";
}

export interface SkipLookup {
    id: string;
    type: "movie" | "series";
    season?: number;
    episode?: number;
    duration: number;
}

type JsonRecord = Record<string, unknown>;
const record = (value: unknown): JsonRecord => value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord : {};

/** Use the API's millisecond fields; null boundaries mean start/end of media. */
export function normalizeSkipSegments(data: unknown, provider: SkipSegment["provider"], duration: number): SkipSegment[] {
    if (!Number.isFinite(duration) || duration <= 0) return [];
    const result: SkipSegment[] = [];
    const body = record(data);
    for (const kind of ["intro", "recap", "credits"] as const) {
        const value = body[kind === "credits" && provider === "introdb" ? "outro" : kind];
        const candidates = Array.isArray(value) ? value : value ? [value] : [];
        for (const candidate of candidates) {
            const segment = record(candidate);
            const { start_ms: startMs, end_ms: endMs } = segment;
            // Missing fields and a declared absence (null/null) are not segments.
            if (startMs === undefined || endMs === undefined || (startMs === null && endMs === null)) continue;
            if ((startMs !== null && (typeof startMs !== "number" || !Number.isFinite(startMs)))
                || (endMs !== null && (typeof endMs !== "number" || !Number.isFinite(endMs)))) continue;
            const start = startMs === null ? 0 : (startMs as number) / 1000;
            const end = endMs === null ? duration : (endMs as number) / 1000;
            // Never silently clamp a timestamp from a different/longer release.
            if (start < 0 || end > duration || end <= start) continue;
            result.push({ kind, start, end, provider });
        }
    }
    return result.sort((a, b) => a.start - b.start);
}

/** Both providers load concurrently; primary data wins separately for each kind. */
export async function fetchSkipSegments(
    lookup: SkipLookup,
    signal: AbortSignal,
    resolveIMDb: (_id: string, _type: "movie" | "series") => Promise<string | null>,
    fetcher: typeof fetch = fetch,
): Promise<SkipSegment[]> {
    const { type, season, episode, duration } = lookup;
    if (!Number.isFinite(duration) || duration <= 0) return [];
    if (type === "series" && (!Number.isInteger(season) || season! < 0 || !Number.isInteger(episode) || episode! < 1)) return [];
    let id: string;
    try { id = decodeURIComponent(lookup.id); } catch { return []; }
    const imdb = /^(tt\d+)(?::|$)/.exec(id)?.[1];
    const tmdb = /^tmdb:(\d+)(?::\d+:\d+)?$/.exec(id)?.[1];
    if (!imdb && !tmdb) return [];
    const numbers: Record<string, string> = type === "series" ? { season: String(season), episode: String(episode) } : {};
    const read = async (url: string): Promise<unknown> => {
        try {
            const response = await fetcher(url, {
                signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
                credentials: "omit",
            });
            return response.ok ? await response.json() : null;
        } catch { return null; }
    };
    const primaryParams = new URLSearchParams({
        ...(imdb ? { imdb_id: imdb } : { tmdb_id: tmdb! }),
        ...numbers,
        duration_ms: String(Math.round(duration * 1000)),
    });
    const primary = read(`https://api.theintrodb.org/v4/media?${primaryParams}`);
    const fallback = (async () => {
        try {
            const fallbackId = imdb || await resolveIMDb(`tmdb:${tmdb}`, type);
            if (signal.aborted || !fallbackId || !/^tt\d+$/.test(fallbackId)) return null;
            const params = new URLSearchParams({ imdb_id: fallbackId, ...numbers });
            if (type === "movie") params.set("is_movie", "true");
            // IntroDB only allows its own website origin in CORS responses.
            return await read(`/api/skip-segments/introdb?${params}`);
        } catch { return null; }
    })();
    const [primaryData, fallbackData] = await Promise.all([primary, fallback]);
    if (signal.aborted) return [];
    const preferred = normalizeSkipSegments(primaryData, "theintrodb", duration);
    const missing = normalizeSkipSegments(fallbackData, "introdb", duration)
        .filter(segment => !preferred.some(item => item.kind === segment.kind));
    return [...preferred, ...missing].sort((a, b) => a.start - b.start);
}

export function activeSkipSegment(segments: SkipSegment[], time: number, skipped: SkipSegment[] = []): SkipSegment | undefined {
    return segments.find(segment => time >= segment.start && time < segment.end
        && !skipped.some(previous => previous.kind === segment.kind
            && previous.start < segment.end && segment.start < previous.end));
}
