"use server";

import { artworkUrl, mediaArtwork } from "@/lib/artwork";

import type { MediaItem, StremioMeta, StremioMetaResponse
} from "@/types/stremio";
import { getInstalledAddons } from "./auth";

// ─── Helpers ─────────────────────────────────────────────────────

async function fetchAddonResource<T>(
  transportUrl: string,
  path: string
): Promise<T | null> {
  try {
    const base = transportUrl.replace(/\/manifest\.json$/, "");
    const url = `${base}/${path}`;
    const response = await fetch(url, { next: { revalidate: 300 } });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

function metaToMediaItem(meta: StremioMeta, addonTransportUrl?: string): MediaItem {
  return {
    id: meta.id,
    type: meta.type as MediaItem["type"],
    name: meta.name,
    ...mediaArtwork(meta.id, meta.type),
    description: meta.description,
    releaseInfo: meta.releaseInfo,
    imdbRating: meta.imdbRating,
    genres: meta.genres,
    cast: meta.cast,
    director: meta.director,
    writer: meta.writer,
    runtime: meta.runtime,
    year: meta.year,
    videos: meta.videos?.map((video) => ({
      ...video,
      thumbnail: artworkUrl(meta.id, "series", "still", video.season ?? 1, video.episode ?? 1),
    })),
    links: meta.links,
    trailers: meta.trailers,
    behaviorHints: meta.behaviorHints,
    addonTransportUrl,
  };
}

// ─── Seasons ─────────────────────────────────────────────────────

export interface Season {
  number: number;
  name: string;
  episodeCount: number;
}

export async function fetchSeasons(seriesId: string): Promise<Season[]> {
  try {
    const addons = await getInstalledAddons();

    for (const addon of addons) {
      const hasMetaResource = addon.manifest.resources.some((r) =>
        typeof r === "string" ? r === "meta" : r.name === "meta"
      );
      if (!hasMetaResource) continue;

      const data = await fetchAddonResource<StremioMetaResponse>(
        addon.transportUrl,
        `meta/series/${seriesId}.json`
      );

      if (data?.meta?.videos && data.meta.videos.length > 0) {
        // Derive seasons from video objects
        const seasonMap = new Map<number, number>();
        for (const video of data.meta.videos) {
          const sNum = video.season ?? 1;
          seasonMap.set(sNum, (seasonMap.get(sNum) || 0) + 1);
        }

        return Array.from(seasonMap.entries())
          .sort(([a], [b]) => a - b)
          .map(([number, count]) => ({
            number,
            name: `Season ${number}`,
            episodeCount: count,
          }));
      }
    }

    return [];
  } catch (error) {
    console.error("Failed to fetch seasons:", error);
    return [];
  }
}

// ─── Episodes ────────────────────────────────────────────────────

export interface Episode {
  id: string;
  title: string;
  season: number;
  episode: number;
  overview?: string;
  thumbnail?: string;
  released?: string;
  resumePositionTicks?: number;
  progressPercent?: number;
}

export async function fetchEpisodes(
  seriesId: string,
  seasonNumber?: number
): Promise<Episode[]> {
  try {
    const addons = await getInstalledAddons();

    for (const addon of addons) {
      const hasMetaResource = addon.manifest.resources.some((r) =>
        typeof r === "string" ? r === "meta" : r.name === "meta"
      );
      if (!hasMetaResource) continue;

      const data = await fetchAddonResource<StremioMetaResponse>(
        addon.transportUrl,
        `meta/series/${seriesId}.json`
      );

      if (data?.meta?.videos) {
        let videos = data.meta.videos;

        if (seasonNumber !== undefined) {
          videos = videos.filter((v) => (v.season ?? 1) === seasonNumber);
        }

        return videos.map((v) => ({
          id: v.id,
          title: v.title || v.name || `Episode ${v.episode ?? 1}`,
          season: v.season ?? 1,
          episode: v.episode ?? 1,
          overview: v.overview,
          thumbnail: artworkUrl(seriesId, "series", "still", v.season ?? 1, v.episode ?? 1),
          released: v.released,
          resumePositionTicks:
            typeof v.resumePositionTicks === "number"
              ? v.resumePositionTicks
              : undefined,
          progressPercent:
            typeof v.progressPercent === "number"
              ? v.progressPercent
              : undefined,
        }));
      }
    }

    return [];
  } catch (error) {
    console.error("Failed to fetch episodes:", error);
    return [];
  }
}

// ─── TV Show Details ─────────────────────────────────────────────

export async function fetchTVShowDetails(
  seriesId: string
): Promise<MediaItem | null> {
  try {
    const addons = await getInstalledAddons();

    for (const addon of addons) {
      const hasMetaResource = addon.manifest.resources.some((r) =>
        typeof r === "string" ? r === "meta" : r.name === "meta"
      );
      if (!hasMetaResource) continue;

      const data = await fetchAddonResource<StremioMetaResponse>(
        addon.transportUrl,
        `meta/series/${seriesId}.json`
      );

      if (data?.meta) {
        return metaToMediaItem(data.meta, addon.transportUrl);
      }
    }

    return null;
  } catch (error) {
    console.error("Failed to fetch TV show details:", error);
    return null;
  }
}

// ─── Episode Details ─────────────────────────────────────────────

export async function fetchEpisodeDetails(
  seriesId: string,
  season: number,
  episode: number
): Promise<Episode | null> {
  try {
    const episodes = await fetchEpisodes(seriesId, season);
    return episodes.find((e) => e.episode === episode) || null;
  } catch (error) {
    console.error("Failed to fetch episode details:", error);
    return null;
  }
}

// ─── Next Episode ────────────────────────────────────────────────

export async function getNextEpisodeForSeries(
  seriesId: string
): Promise<Episode | null> {
  try {
    const episodes = await fetchEpisodes(seriesId);
    // Return the first episode as a starting point
    return episodes[0] || null;
  } catch (error) {
    console.error("Failed to get next episode:", error);
    return null;
  }
}
