"use server";

import { outboundFetch } from "@/lib/server/outbound-fetch";

import { artworkUrl, mediaArtwork } from "@/lib/artwork";
import { pickRandomEpisode } from "@/lib/media/shuffle-episode";

import type { MediaItem, StremioMeta, StremioMetaResponse
} from "@/types/stremio";
import { getAuthData } from "@/lib/server/auth";
import { getInstalledAddons } from "./auth";

// ─── Helpers ─────────────────────────────────────────────────────

async function fetchAddonResource<T>(
  transportUrl: string,
  path: string,
  signal?: AbortSignal
): Promise<T | null> {
  try {
    await getAuthData();
    const base = transportUrl.replace(/\/manifest\.json$/, "");
    const url = `${base}/${path}`;
    const response = await outboundFetch(url, { next: { revalidate: 300 }, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000) });
    if (!response.ok) return null;
    return response.json();
  } catch {
    signal?.throwIfAborted();
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

export async function fetchSeasons(seriesId: string, signal?: AbortSignal): Promise<Season[]> {
  try {
    if (/^tmdb:[1-9]\d*$/.test(seriesId)) {
      await getAuthData();
      const { getTMDBSeasons } = await import("@/lib/tmdb-discovery");
      return await getTMDBSeasons(seriesId, signal);
    }
    const addons = await getInstalledAddons();

    for (const addon of addons) {
      const hasMetaResource = addon.manifest.resources.some((r) =>
        typeof r === "string" ? r === "meta" : r.name === "meta"
      );
      if (!hasMetaResource) continue;

      const data = await fetchAddonResource<StremioMetaResponse>(
        addon.transportUrl,
        `meta/series/${seriesId}.json`,
        signal
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
    signal?.throwIfAborted();
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
  seasonNumber?: number,
  signal?: AbortSignal
): Promise<Episode[]> {
  try {
    if (/^tmdb:[1-9]\d*$/.test(seriesId)) {
      await getAuthData();
      const { getTMDBSeasons, getTMDBEpisodes, mapTMDBSeasons } = await import("@/lib/tmdb-discovery");
      if (seasonNumber !== undefined) return await getTMDBEpisodes(seriesId, seasonNumber, signal);
      const seasons = await getTMDBSeasons(seriesId, signal);
      return (await mapTMDBSeasons(seasons.filter(season => season.number > 0).map(season => season.number),
        number => getTMDBEpisodes(seriesId, number, signal), signal)).flat();
    }
    const addons = await getInstalledAddons();

    for (const addon of addons) {
      const hasMetaResource = addon.manifest.resources.some((r) =>
        typeof r === "string" ? r === "meta" : r.name === "meta"
      );
      if (!hasMetaResource) continue;

      const data = await fetchAddonResource<StremioMetaResponse>(
        addon.transportUrl,
        `meta/series/${seriesId}.json`,
        signal
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
    signal?.throwIfAborted();
    console.error("Failed to fetch episodes:", error);
    return [];
  }
}

// ─── TV Show Details ─────────────────────────────────────────────

export async function fetchTVShowDetails(
  seriesId: string
): Promise<MediaItem | null> {
  try {
    if (/^tmdb:[1-9]\d*$/.test(seriesId)) {
      await getAuthData();
      const { tmdbMediaItem } = await import("@/lib/tmdb-discovery");
      return await tmdbMediaItem(seriesId, "series");
    }
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
  episode: number,
  signal?: AbortSignal
): Promise<Episode | null> {
  try {
    // A single canonical episode lookup also repairs unnamed add-on/resume entries.
    await getAuthData();
    const { getTMDBEpisode } = await import("@/lib/tmdb-discovery");
    const item = await getTMDBEpisode(seriesId, season, episode, signal);
    if (item.name?.trim()) return { id: `${seriesId}:${season}:${episode}`, title: item.name,
      season, episode, thumbnail: item.thumbnail };
  } catch { signal?.throwIfAborted(); }
  try {
    const episodes = await fetchEpisodes(seriesId, season, signal);
    return episodes.find((e) => e.episode === episode) || null;
  } catch (error) {
    console.error("Failed to fetch episode details:", error);
    return null;
  }
}

// ─── Next Episode ────────────────────────────────────────────────

export async function getRandomEpisodeForSeries(seriesId: string): Promise<Episode | null> {
  return pickRandomEpisode(await fetchEpisodes(seriesId));
}

/** Advance through regular seasons only, preserving explicit episode playback. */
export async function getFollowingEpisodeForSeries(
  seriesId: string,
  season: number,
  episode: number,
  signal?: AbortSignal,
): Promise<Episode | null> {
  if (!Number.isSafeInteger(season) || season < 0 || !Number.isSafeInteger(episode) || episode < 1) return null;
  if (season === 0) return getNextEpisodeForSeries(seriesId, signal);
  const episodes = await fetchEpisodes(seriesId, season, signal);
  const following = episodes.filter(item => item.season === season && item.episode > episode && (!item.released || Date.parse(item.released) <= Date.now()))
    .sort((a, b) => a.episode - b.episode)[0];
  if (following) return following;
  const seasons = (await fetchSeasons(seriesId, signal))
    .filter(item => item.number > season && item.episodeCount > 0)
    .sort((a, b) => a.number - b.number);
  for (const next of seasons) {
    const first = (await fetchEpisodes(seriesId, next.number, signal))
      .filter(item => item.season === next.number && item.episode > 0 && (!item.released || Date.parse(item.released) <= Date.now()))
      .sort((a, b) => a.episode - b.episode)[0];
    if (first) return first;
  }
  return null;
}

export async function getNextEpisodeForSeries(
  seriesId: string,
  signal?: AbortSignal
): Promise<Episode | null> {
  try {
    const episodes = await fetchEpisodes(seriesId, 1, signal);
    // Provider order can put specials or later episodes first.
    return episodes.find(episode => episode.season === 1 && episode.episode === 1) || null;
  } catch (error) {
    console.error("Failed to get next episode:", error);
    return null;
  }
}
