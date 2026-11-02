import { getUser } from "@/app/actions/auth";
import { resolveTMDBPlaybackId } from "@/lib/tmdb-discovery";
import { buildEpisodePath } from "@/lib/series-route";

/** Resolve a selected search card without enriching every result with an IMDb lookup. */
export async function GET(request: Request) {
    if (!await getUser()) return new Response("Sign in to open this title.", { status: 401 });
    const params = new URL(request.url).searchParams;
    const id = params.get("id"), type = params.get("type");
    const season = params.get("season"), episode = params.get("episode");
    if (!id || !/^tmdb:[1-9]\d*$/.test(id) || (type !== "movie" && type !== "series")
        || ((season !== null || episode !== null) && (type !== "series" || !/^\d+$/.test(season || "") || !/^[1-9]\d*$/.test(episode || "")
            || !Number.isSafeInteger(Number(season)) || !Number.isSafeInteger(Number(episode))))) {
        return new Response("Invalid title selection.", { status: 400 });
    }
    try {
        const canonical = await resolveTMDBPlaybackId(id, type, request.signal);
        const path = season !== null && episode !== null
            ? buildEpisodePath(canonical, Number(season), Number(episode))
            : `/${type}/${encodeURIComponent(canonical)}`;
        return Response.redirect(new URL(path, request.url), 307);
    } catch (error) {
        request.signal.throwIfAborted();
        return new Response(error instanceof Error ? error.message : "Could not open this TMDB title.", { status: 502 });
    }
}
