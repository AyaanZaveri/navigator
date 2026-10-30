export type ArtworkKind = "poster" | "backdrop" | "logo" | "still";

/** Only resolve explicit IMDb/TMDB identities; never guess from a title. */
export function artworkUrl(
  id: string,
  type: string,
  kind: ArtworkKind,
  season?: number,
  episode?: number,
): string | undefined {
  if (type !== "movie" && type !== "series") return undefined;
  const mediaId = /^(tt\d+)(?::|$)/.exec(id)?.[1]
    ?? /^tmdb:\d+$/.exec(id)?.[0];
  if (!mediaId) return undefined;
  const params = new URLSearchParams({ id: mediaId, type, kind });
  // Previous logo redirects were cached for a day with the old selection.
  if (kind === "logo") params.set("v", "2");
  if (kind === "still") {
    if (type !== "series" || typeof season !== "number" || !Number.isSafeInteger(season) || season < 0
      || typeof episode !== "number" || !Number.isSafeInteger(episode) || episode < 1) return undefined;
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
