export interface ParsedSeriesRouteId {
  seriesId: string;
  season?: number;
  episode?: number;
  isEpisodeTarget: boolean;
}

export function parseSeriesRouteId(id: string): ParsedSeriesRouteId {
  const normalizedId = (() => {
    try {
      return decodeURIComponent(id);
    } catch {
      return id;
    }
  })();

  const slashParts = normalizedId.split("/").filter(Boolean);
  if (slashParts.length >= 3) {
    const episode = Number(slashParts[slashParts.length - 1]);
    const season = Number(slashParts[slashParts.length - 2]);
    const seriesId = slashParts.slice(0, slashParts.length - 2).join("/");

    if (
      seriesId &&
      Number.isFinite(season) &&
      Number.isFinite(episode) &&
      Number.isInteger(season) &&
      Number.isInteger(episode) &&
      season >= 0 &&
      episode > 0
    ) {
      return {
        seriesId,
        season,
        episode,
        isEpisodeTarget: true,
      };
    }
  }

  const parts = normalizedId.split(":");

  if (parts.length >= 3) {
    const season = Number(parts[parts.length - 2]);
    const episode = Number(parts[parts.length - 1]);
    const seriesId = parts.slice(0, parts.length - 2).join(":");

    if (
      seriesId &&
      Number.isFinite(season) &&
      Number.isFinite(episode) &&
      Number.isInteger(season) &&
      Number.isInteger(episode) &&
      season >= 0 &&
      episode > 0
    ) {
      return {
        seriesId,
        season,
        episode,
        isEpisodeTarget: true,
      };
    }
  }

  return { seriesId: normalizedId, isEpisodeTarget: false };
}

export function buildSeriesPath(seriesId: string): string {
  return `/series/${encodeURIComponent(seriesId)}`;
}

export function buildEpisodePath(
  seriesId: string,
  season: number,
  episode: number
): string {
  return `${buildSeriesPath(seriesId)}/${season}/${episode}`;
}

export function toEpisodeNavigationPath(id: string): string {
  const parsed = parseSeriesRouteId(id);
  if (parsed.isEpisodeTarget && parsed.season !== undefined && parsed.episode !== undefined) {
    return buildEpisodePath(parsed.seriesId, parsed.season, parsed.episode);
  }
  return buildSeriesPath(id);
}
