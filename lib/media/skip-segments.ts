export type SkipSegmentKind = "intro" | "recap" | "credits";
export interface SkipSegment {
    kind: SkipSegmentKind;
    start: number;
    end: number;
    provider: "theintrodb" | "introdb" | "skipdb";
    confidence?: number;
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

export function formatSkipTime(seconds: number): string {
    if (!Number.isFinite(seconds)) return "unknown";
    const milliseconds = Math.round(Math.abs(seconds) * 1000);
    return `${seconds < 0 ? "-" : ""}${Math.floor(milliseconds / 60000)}:${String(Math.floor(milliseconds / 1000) % 60).padStart(2, "0")}.${String(milliseconds % 1000).padStart(3, "0")}`;
}

/** Keep provider confidence/match fields alongside human-readable timestamps. */
function providerTimings(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(providerTimings);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).map(([key, field]) => [key,
        key.endsWith("_ms") && typeof field === "number" ? formatSkipTime(field / 1000) : providerTimings(field),
    ]));
}

/** Use the API's millisecond fields; null boundaries mean start/end of media. */
export function normalizeSkipSegments(data: unknown, provider: SkipSegment["provider"], duration: number): SkipSegment[] {
    if (!Number.isFinite(duration) || duration <= 0) return [];
    const result: SkipSegment[] = [];
    const body = provider === "skipdb" ? record(record(data).segments) : record(data);
    // TheIntroDB can fall back to a popular release even when no runtime matches.
    if (provider === "theintrodb" && typeof body.group_duration_ms === "number" && body.group_duration_ms > 0
        && Math.abs(body.group_duration_ms - duration * 1000) > 15000) return [];
    for (const kind of ["intro", "recap", "credits"] as const) {
        const value = body[kind === "credits" && provider !== "theintrodb" ? "outro" : kind];
        const candidates = Array.isArray(value) ? value : value ? [value] : [];
        for (const candidate of candidates) {
            const segment = record(candidate);
            const confidence = segment.confidence;
            if (confidence !== undefined && (typeof confidence !== "number" || !Number.isFinite(confidence)
                || confidence <= 0 || confidence > 1)) continue;
            if (provider === "skipdb") {
                // SkipDB marks other releases explicitly; a plausible timestamp alone is insufficient.
                const { match, confidence, offset_ms: offset } = segment;
                if ((match !== "exact" && match !== "shifted") || typeof confidence !== "number"
                    || !Number.isFinite(confidence) || confidence < 0.8 || confidence > 1
                    || typeof offset !== "number" || !Number.isFinite(offset)
                    || Math.abs(offset) > (match === "exact" ? 2000 : 15000)) continue;
            }
            const { start_ms: startMs, end_ms: endMs } = segment;
            // Missing fields and a declared absence (null/null) are not segments.
            if (startMs === undefined || endMs === undefined || (startMs === null && endMs === null)) continue;
            if ((startMs !== null && (typeof startMs !== "number" || !Number.isFinite(startMs)))
                || (endMs !== null && (typeof endMs !== "number" || !Number.isFinite(endMs)))) continue;
            const start = startMs === null ? 0 : (startMs as number) / 1000;
            const end = endMs === null ? duration : (endMs as number) / 1000;
            // Never silently clamp a timestamp from a different/longer release.
            if (start < 0 || end > duration || end <= start) continue;
            // A provider can return 0/null for credits, marking the entire story
            // as skippable, or put credits halfway through an episode.
            if (kind === "credits" && (start === 0 || end - start > duration / 2)) continue;
            result.push({ kind, start, end, provider, ...(typeof confidence === "number" ? { confidence } : {}) });
        }
    }
    return result.sort((a, b) => a.start - b.start);
}

/** Load concurrently; prefer sound primary data, then IntroDB, runtime-matched SkipDB, and weak primary data. */
export async function fetchSkipSegments(
    lookup: SkipLookup,
    signal: AbortSignal,
    resolveIMDb: (_id: string, _type: "movie" | "series") => Promise<string | null>,
    fetcher: typeof fetch = fetch,
    onUpdate?: (_segments: SkipSegment[]) => void,
): Promise<SkipSegment[]> {
    const { type, season, episode, duration } = lookup;
    if (signal.aborted || !Number.isFinite(duration) || duration <= 0) return [];
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
        details: "true",
        merge_unknown: "false",
    });
    const data = new Map<SkipSegment["provider"], unknown>();
    const merge = () => {
        const merged: SkipSegment[] = [];
        const primary = normalizeSkipSegments(data.get("theintrodb"), "theintrodb", duration);
        const weakPrimary = primary.filter(segment => segment.confidence !== undefined && segment.confidence < 0.5);
        const groups = [
            primary.filter(segment => !weakPrimary.includes(segment)),
            normalizeSkipSegments(data.get("introdb"), "introdb", duration),
            normalizeSkipSegments(data.get("skipdb"), "skipdb", duration),
            weakPrimary,
        ];
        for (const group of groups) {
            merged.push(...group.filter(segment => !merged.some(item => item.kind === segment.kind)));
        }
        return merged.sort((a, b) => a.start - b.start);
    };
    const settle = async (provider: SkipSegment["provider"], request: Promise<unknown>) => {
        data.set(provider, await request);
        // A slow/unavailable fallback must not delay a fast provider's skip button.
        if (!signal.aborted) {
            const selected = merge();
            console.log("[Navigator skips] Provider result", {
                id, season, episode, provider, duration: formatSkipTime(duration),
                received: providerTimings(data.get(provider)),
                accepted: normalizeSkipSegments(data.get(provider), provider, duration).map(segment => ({
                    ...segment, start: formatSkipTime(segment.start), end: formatSkipTime(segment.end),
                })),
                selected: selected.map(segment => ({
                    ...segment, start: formatSkipTime(segment.start), end: formatSkipTime(segment.end),
                })),
            });
            onUpdate?.(selected);
        }
    };
    const primary = settle("theintrodb", read(`https://api.theintrodb.org/v4/media?${primaryParams}`));
    const fallbackId = (async () => {
        try {
            const id = imdb || await resolveIMDb(`tmdb:${tmdb}`, type);
            return !signal.aborted && id && /^tt\d+$/.test(id) ? id : null;
        } catch { return null; }
    })();
    const fallback = settle("introdb", (async () => {
        const id = await fallbackId;
        if (!id) return null;
        const params = new URLSearchParams({ imdb_id: id, ...numbers });
        if (type === "movie") params.set("is_movie", "true");
        // IntroDB only allows its own website origin in CORS responses.
        return read(`/api/skip-segments/introdb?${params}`);
    })());
    const skipdb = settle("skipdb", (async () => {
        const id = await fallbackId;
        if (!id) return null;
        const params = new URLSearchParams({ imdb_id: id, ...numbers, duration: String(duration), adjust: "conservative" });
        const result = await read(`https://api.skipdb.tv/api/segments?${params}`);
        const body = record(result);
        if (body.imdb_id !== id || (type === "series" && (body.season !== season || body.episode !== episode))) return null;
        return result;
    })());
    await Promise.all([primary, fallback, skipdb]);
    return signal.aborted ? [] : merge();
}

export function activeSkipSegment(segments: SkipSegment[], time: number, skipped: SkipSegment[] = [], introLeadSeconds = 0): SkipSegment | undefined {
    const eligible = segments.filter(segment => !skipped.some(previous => previous.kind === segment.kind
        && previous.start < segment.end && segment.start < previous.end));
    // A currently playing recap/other segment takes priority over an upcoming intro.
    return eligible.find(segment => time >= segment.start && time < segment.end)
        ?? eligible.find(segment => segment.kind === "intro" && time >= Math.max(0, segment.start - introLeadSeconds) && time < segment.start);
}
