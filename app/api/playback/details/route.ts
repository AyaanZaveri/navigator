import { getAuthData } from "@/lib/server/auth";
import { fetchMediaDetails } from "@/app/actions/media";
import { projectPlaybackDetails } from "@/lib/media/playback-details";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const id = params.get("id") || "";
  const type = params.get("type") || "";
  const season = params.has("season") ? Number(params.get("season")) : undefined;
  const episode = params.has("episode") ? Number(params.get("episode")) : undefined;
  const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
  if (!/^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,199}$/.test(id) || !["movie", "series", "channel", "tv"].includes(type)
    || (season !== undefined && (!Number.isSafeInteger(season) || season < 0 || season > 10000))
    || (episode !== undefined && (!Number.isSafeInteger(episode) || episode < 1 || episode > 10000))) {
    return new Response(null, { status: 400, headers });
  }
  try { await getAuthData(); } catch { return new Response(null, { status: 401, headers }); }
  try {
    if (params.has("metadata")) {
      const { metadataIdentity } = await import("@/lib/server/metadata-identity");
      const { revision } = await metadataIdentity();
      if (params.get("revision") !== revision) return new Response(null, { status: 409, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
    }
    const details = await fetchMediaDetails(id, type, request.signal, { playback: !params.has("metadata") });
    request.signal.throwIfAborted();
    const metadata = params.has("metadata") && details ? (await import("@/lib/media/metadata")).titleEnvelope(details, (await import("@/lib/server/metadata-cache")).serverMetadataCache.fetchedAt(details)) : undefined;
    return Response.json(params.has("metadata") ? { metadata: metadata || null } : { details: details ? projectPlaybackDetails(details, season, episode) : null }, { headers });
  } catch {
    return new Response(null, { status: 502, headers });
  }
}
