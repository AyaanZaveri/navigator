import { getAuthData } from "@/app/actions/auth";
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
    const details = await fetchMediaDetails(id, type, request.signal, { playback: true });
    request.signal.throwIfAborted();
    return Response.json({ details: details ? projectPlaybackDetails(details, season, episode) : null }, { headers });
  } catch {
    return new Response(null, { status: 502, headers });
  }
}
