import { getAuthData } from "@/lib/server/auth";
import { resolveTMDBPlaybackId } from "@/lib/tmdb-discovery";

/** Resolve only the selected TMDB title; search results need no per-card lookups. */
export async function GET(request: Request) {
    const params = new URL(request.url).searchParams;
    const id = params.get("id") || "";
    const type = params.get("type");
    if (!/^tmdb:[1-9]\d*$/.test(id) || (type !== "movie" && type !== "series")) return new Response(null, { status: 400 });
    try { await getAuthData(); } catch { return new Response(null, { status: 401 }); }
    try {
        const resolved = await resolveTMDBPlaybackId(id, type, request.signal);
        return Response.json({ id: resolved }, { headers: { "Cache-Control": "private, no-store" } });
    } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not resolve this title for playback." }, { status: 502 });
    }
}
