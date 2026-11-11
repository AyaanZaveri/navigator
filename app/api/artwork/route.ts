import { episodeHeroStillUrl, artworkUrl, type ArtworkKind } from "@/lib/artwork";
import { getTMDBArtwork } from "@/lib/tmdb-artwork";

export async function GET(request: Request) {
    const params = new URL(request.url).searchParams;
    const id = params.get("id") ?? "";
    const type = params.get("type");
    const kind = params.get("kind") as ArtworkKind;
    const width = params.get("width");
    const size = params.get("size");
    const season = params.has("season") ? Number(params.get("season")) : undefined;
    const episode = params.has("episode") ? Number(params.get("episode")) : undefined;
    if ((type !== "movie" && type !== "series")
    || (size !== null && (kind !== "still" || size !== "1280"))
    || (width !== null && (kind !== "backdrop" || !["300", "780", "1280"].includes(width)))
    || !["poster", "backdrop", "logo", "still"].includes(kind)
    || !artworkUrl(id, type, kind, season, episode)) {
        return new Response(null, { status: 400 });
    }
    const original = await getTMDBArtwork(id, type, kind, season, episode);
    if (!original) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
    const image = size === "1280" ? episodeHeroStillUrl(original)! : width && /^https:\/\/image\.tmdb\.org\/t\/p\/[^/]+\//.test(original)
        ? original.replace(/\/t\/p\/[^/]+\//, `/t/p/w${width}/`) : original;
    if (params.get("sample") === "1") {
    // Returning image bytes keeps the canvas origin-clean even when the CDN
    // redirect does not permit CORS. The upstream URL comes only from TMDB.
        try {
            const sample = params.get("palette") === "1" && kind !== "logo" && /^https:\/\/image\.tmdb\.org\/t\/p\/[^/]+\//.test(image)
                ? image.replace(/\/t\/p\/[^/]+\//, `/t/p/${kind === "poster" ? "w342" : "w300"}/`) : image;
            const upstream = await fetch(sample, { next: { revalidate: 86400 }, signal: AbortSignal.timeout(8000) });
            const contentType = upstream.headers.get("Content-Type") ?? "";
            if (!upstream.ok || !contentType.startsWith("image/")) throw new Error("Artwork unavailable");
            return new Response(upstream.body, { headers: {
                "Content-Type": contentType, "Cache-Control": "private, max-age=86400", Vary: "Cookie",
            } });
        } catch {
            return new Response(null, { status: 502, headers: { "Cache-Control": "no-store" } });
        }
    }
    return new Response(null, {
        status: 307,
        headers: { Location: image, "Cache-Control": "private, max-age=86400", Vary: "Cookie" },
    });
}
