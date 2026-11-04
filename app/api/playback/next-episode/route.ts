import { getAuthData } from "@/lib/server/auth";
import { getFollowingEpisodeForSeries } from "@/app/actions/tv-shows";

/** A small read endpoint avoids the browser's serialized Server Action queue. */
export async function GET(request: Request) {
    const params = new URL(request.url).searchParams;
    const id = params.get("id") || "";
    const season = Number(params.get("season"));
    const episode = Number(params.get("episode"));
    if (!/^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,199}$/.test(id) || !params.has("season") || !params.has("episode")
        || !Number.isSafeInteger(season) || season < 0 || season > 10000
        || !Number.isSafeInteger(episode) || episode < 1 || episode > 10000) {
        return new Response(null, { status: 400 });
    }
    try { await getAuthData(); } catch { return new Response(null, { status: 401 }); }
    try {
        const result = await getFollowingEpisodeForSeries(id, season, episode, request.signal);
        request.signal.throwIfAborted();
        return Response.json({ episode: result }, { headers: { "Cache-Control": "private, no-store" } });
    } catch {
        return new Response(null, { status: 502, headers: { "Cache-Control": "no-store" } });
    }
}
