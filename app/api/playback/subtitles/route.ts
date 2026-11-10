import { getAuthData } from "@/lib/server/auth";
import { getSubtitleTracks } from "@/app/actions/utils";
import { fetchSubtitleFileContent } from "@/app/actions/subtitles";

const headers = { "Cache-Control": "private, no-store" };
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers });

/** Independent read requests avoid the client's sequential Server Action queue. */
export async function GET(request: Request) {
    try { await getAuthData(); } catch { return reply({ error: "Unauthorized" }, 401); }
    const params = new URL(request.url).searchParams;
    const id = params.get("id") || "", type = params.get("type") || "";
    const filename = params.get("filename") || undefined, episodeTitle = params.get("episodeTitle") || undefined;
    const videoSize = params.has("videoSize") ? Number(params.get("videoSize")) : undefined;
    if (!/^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,199}$/.test(id) || !["movie", "series", "tv", "channel"].includes(type)
        || (filename?.length ?? 0) > 2048 || (episodeTitle?.length ?? 0) > 500
        || (videoSize !== undefined && (!Number.isSafeInteger(videoSize) || videoSize <= 0))) return reply({ error: "Invalid subtitle request" }, 400);
    try {
        const signal = AbortSignal.any([request.signal, AbortSignal.timeout(20_000)]);
        const tracks = await getSubtitleTracks(id, type, { filename, videoSize, episodeTitle, signal });
        signal.throwIfAborted();
        return reply({ tracks });
    } catch { return reply({ error: "Subtitle discovery unavailable" }, 502); }
}

export async function POST(request: Request) {
    try { await getAuthData(); } catch { return reply({ error: "Unauthorized" }, 401); }
    try {
        const { src } = await request.json();
        if (typeof src !== "string" || src.length > 8192 || !/^https?:\/\//i.test(src)) return reply({ error: "Invalid subtitle URL" }, 400);
        // The shared downloader enforces public outbound destinations, byte limits,
        // and a deadline. Its AbortSignal belongs to this HTTP request only.
        const signal = AbortSignal.any([request.signal, AbortSignal.timeout(15_000)]);
        const result = await fetchSubtitleFileContent(src, signal);
        signal.throwIfAborted();
        return reply(result);
    } catch { return reply({ success: false, content: "", error: "Subtitle download unavailable" }, 502); }
}
