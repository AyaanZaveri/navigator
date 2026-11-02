export type ArtworkKind = "poster" | "backdrop" | "logo" | "still";

/** Canvas consumers need image bytes from our origin, rather than a CDN redirect. */
export function artworkSampleUrl(source: string): string {
  if (!source.startsWith("/api/artwork?")) return source;
  const params = new URLSearchParams(source.slice(source.indexOf("?") + 1));
  params.set("sample", "1");
  return `/api/artwork?${params}`;
}

/** Only resolve explicit IMDb/TMDB identities; never guess from a title. */
export function artworkUrl(
  id: string,
  type: string,
  kind: ArtworkKind,
  season?: number,
  episode?: number,
): string | undefined {
  if (type !== "movie" && type !== "series") return undefined;
  const normalizedId = (() => {
    try { return decodeURIComponent(id); } catch { return id; }
  })();
  const mediaId = /^(tt\d+)(?::|$)/.exec(normalizedId)?.[1]
    ?? /^(tmdb:\d+)(?::\d+:\d+)?$/.exec(normalizedId)?.[1];
  if (!mediaId) return undefined;
  const params = new URLSearchParams({ id: mediaId, type, kind });
  // Refresh redirects that previously served 1280px backdrops.
  if (kind === "backdrop") params.set("v", "1");
  // Invalidate cached logo redirects from before SVG support.
  if (kind === "logo") params.set("v", "3");
  if (kind === "still") {
    if (type !== "series" || typeof season !== "number" || !Number.isSafeInteger(season) || season < 0
      || typeof episode !== "number" || !Number.isSafeInteger(episode) || episode < 1) return undefined;
    // Refresh still URLs that may have cached failures before TMDB was ready.
    params.set("v", "1");
    params.set("season", String(season));
    params.set("episode", String(episode));
  }
  return `/api/artwork?${params}`;
}

export function mediaArtwork(id: string, type: string) {
  return {
    poster: artworkUrl(id, type, "poster"),
    background: artworkUrl(id, type, "backdrop"),
    logo: artworkUrl(id, type, "logo"),
  };
}

/** Also refresh artwork in Navigator cards saved before the provider switch. */
export function artworkFromPath(path?: string): string | undefined {
  const match = /^\/(movie|series)\/([^/?#]+)(?:\/(\d+)\/(\d+))?(?:[?#]|$)/.exec(path ?? "");
  if (!match) return undefined;
  try {
    return artworkUrl(
      decodeURIComponent(match[2]), match[1], match[3] ? "still" : "poster",
      match[3] ? Number(match[3]) : undefined,
      match[4] ? Number(match[4]) : undefined,
    );
  } catch {
    return undefined;
  }
}

/** Keep the canonical TMDB artwork supplied by server metadata. Route IDs can
 * be encoded or include episode suffixes, so rebuilding them loses valid URLs. */
export function episodeThumbnailUrl(
  thumbnail: string | undefined,
  showId: string,
  season: number,
  episode: number,
): string | undefined {
  if (thumbnail?.startsWith("/api/artwork?")) return thumbnail;
  if (thumbnail?.startsWith("https://image.tmdb.org/t/p/")) return thumbnail;
  return artworkUrl(showId, "series", "still", season, episode);
}
