import { getAuthData } from "@/lib/server/auth";
import { fetchEpisodeDetails } from "@/app/actions/tv-shows";

/** A small read endpoint avoids the browser's serialized Server Action queue. */
export async function GET(request: Request) {
    const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
    const params = new URL(request.url).searchParams;
    const id = params.get("id") || "";
    const season = Number(params.get("season"));
    const episode = Number(params.get("episode"));
    if (!/^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,199}$/.test(id) || !params.has("season") || !params.has("episode")
        || !Number.isSafeInteger(season) || season < 0 || season > 10000
        || !Number.isSafeInteger(episode) || episode < 1 || episode > 10000) {
        return new Response(null, { status: 400, headers });
    }
    try { await getAuthData(); } catch { return new Response(null, { status: 401, headers }); }
    try {
        if (params.has("metadata")) {
            const { metadataIdentity } = await import("@/lib/server/metadata-identity");
            const { revision } = await metadataIdentity();
            if (params.get("revision") !== revision) return new Response(null, { status: 409, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
        }
        const result = await fetchEpisodeDetails(id, season, episode, request.signal);
        request.signal.throwIfAborted();
        const metadata = params.has("metadata") && result ? (await import("@/lib/media/metadata")).episodeEnvelope(result, id, (await import("@/lib/server/metadata-cache")).serverMetadataCache.fetchedAt(result)) : undefined;
        return Response.json(params.has("metadata") ? { metadata: metadata || null } : { episode: result }, { headers });
    } catch {
        return new Response(null, { status: 502, headers });
    }
}
