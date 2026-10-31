import { artworkUrl, type ArtworkKind } from "@/lib/artwork";
import { getTMDBArtwork } from "@/lib/tmdb-artwork";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const id = params.get("id") ?? "";
  const type = params.get("type");
  const kind = params.get("kind") as ArtworkKind;
  const season = params.has("season") ? Number(params.get("season")) : undefined;
  const episode = params.has("episode") ? Number(params.get("episode")) : undefined;
  if ((type !== "movie" && type !== "series")
    || !["poster", "backdrop", "logo", "still"].includes(kind)
    || !artworkUrl(id, type, kind, season, episode)) {
    return new Response(null, { status: 400 });
  }
  const image = await getTMDBArtwork(id, type, kind, season, episode);
  if (!image) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(null, {
    status: 307,
    headers: { Location: image, "Cache-Control": "private, max-age=86400", Vary: "Cookie" },
  });
}
