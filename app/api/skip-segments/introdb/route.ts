/** IntroDB's public API does not allow our browser origin. Keep this proxy
 * restricted to timestamp lookups, with no caller-supplied upstream URL. */
export async function GET(request: Request) {
    const params = new URL(request.url).searchParams;
    const imdb = params.get("imdb_id") || "";
    const movie = params.get("is_movie") === "true";
    const season = Number(params.get("season"));
    const episode = Number(params.get("episode"));
    if (!/^tt\d{7,8}$/.test(imdb) || (!movie && (!Number.isSafeInteger(season) || season < 1
        || !Number.isSafeInteger(episode) || episode < 1))) {
        return new Response(null, { status: 400 });
    }
    const query = new URLSearchParams({ imdb_id: imdb });
    if (movie) query.set("is_movie", "true");
    else {
        query.set("season", String(season));
        query.set("episode", String(episode));
    }
    try {
        const response = await fetch(`https://api.introdb.app/segments?${query}`, {
            next: { revalidate: 3600 },
            signal: AbortSignal.any([request.signal, AbortSignal.timeout(4000)]),
        });
        if (!response.ok) return new Response(null, { status: response.status === 404 ? 404 : 502 });
        return Response.json(await response.json(), { headers: { "Cache-Control": "private, max-age=300" } });
    } catch {
        return new Response(null, { status: 502 });
    }
}
