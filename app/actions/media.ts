"use server";

import type {
  StremioAddon,
  StremioMetaPreview,
  StremioMeta,
  StremioStream,
  MediaItem,
  StremioCatalogResponse,
  StremioMetaResponse,
  StremioStreamResponse,
} from "@/types/stremio";
import { getAuthData, getInstalledAddons } from "./auth";

const STREMIO_API = "https://api.strem.io/api";

// ─── Helpers ─────────────────────────────────────────────────────

function addonSupportsResource(
  addon: StremioAddon,
  resource: string,
  type?: string
): boolean {
  return addon.manifest.resources.some((r) => {
    if (typeof r === "string") return r === resource;
    if (r.name !== resource) return false;
    if (!type) return true;
    // Some addon manifests omit `types` for generic stream resources.
    if (!r.types || r.types.length === 0) return true;
    return r.types.includes(type);
  });
}

function addonSupportsCatalog(addon: StremioAddon): boolean {
  return (
    addon.manifest.catalogs.length > 0 &&
    addonSupportsResource(addon, "catalog")
  );
}

async function fetchAddonResource<T>(
  transportUrl: string,
  path: string,
  init?: RequestInit
): Promise<T | null> {
  try {
    // The transport URL may already end with /manifest.json — strip to base
    const base = transportUrl.replace(/\/manifest\.json$/, "");
    const url = `${base}/${path}`;

    const response = await fetch(url, {
      ...(init ?? {}),
      ...(init?.cache || init?.next ? {} : { next: { revalidate: 300 } }),
    });

    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

function metaPreviewToMediaItem(
  meta: StremioMetaPreview,
  addonTransportUrl?: string
): MediaItem {
  return {
    id: meta.id,
    type: meta.type as MediaItem["type"],
    name: meta.name,
    poster: meta.poster,
    background: meta.background,
    logo: meta.logo,
    description: meta.description,
    releaseInfo: meta.releaseInfo,
    imdbRating: meta.imdbRating,
    genres: meta.genres,
    links: meta.links,
    addonTransportUrl,
  };
}

function fullMetaToMediaItem(
  meta: StremioMeta,
  addonTransportUrl?: string
): MediaItem {
  return {
    ...metaPreviewToMediaItem(meta, addonTransportUrl),
    cast: meta.cast,
    director: meta.director,
    writer: meta.writer,
    runtime: meta.runtime,
    year: meta.year ? meta.year : undefined,
    videos: meta.videos,
    trailers: meta.trailers,
    behaviorHints: meta.behaviorHints,
  };
}

// ─── Catalog / Browse ────────────────────────────────────────────

export async function fetchCatalogItems(
  type: string = "movie",
  catalogId: string = "top",
  addonTransportUrl?: string
): Promise<MediaItem[]> {
  try {
    const addons = await getInstalledAddons();

    // If a specific addon is requested, use only that one
    const targets = addonTransportUrl
      ? addons.filter((a) => a.transportUrl === addonTransportUrl)
      : addons.filter((a) => addonSupportsCatalog(a));

    const results: MediaItem[] = [];

    for (const addon of targets) {
      // Find a matching catalog entry
      const catalog = addon.manifest.catalogs.find(
        (c) => c.type === type && (c.id === catalogId || catalogId === "top")
      );

      if (!catalog) continue;

      const data = await fetchAddonResource<StremioCatalogResponse>(
        addon.transportUrl,
        `catalog/${type}/${catalog.id}.json`
      );

      if (data?.metas) {
        for (const meta of data.metas) {
          results.push(metaPreviewToMediaItem(meta, addon.transportUrl));
        }
      }
    }

    return results;
  } catch (error) {
    console.error("Failed to fetch catalog items:", error);
    return [];
  }
}

export async function fetchMovies(limit: number = 20): Promise<MediaItem[]> {
  const items = await fetchCatalogItems("movie", "top");
  return items.slice(0, limit);
}

export async function fetchTVShows(limit: number = 20): Promise<MediaItem[]> {
  const items = await fetchCatalogItems("series", "top");
  return items.slice(0, limit);
}

// ─── Metadata ────────────────────────────────────────────────────

export async function fetchMediaDetails(
  mediaItemId: string,
  type: string = "movie"
): Promise<MediaItem | null> {
  try {
    const addons = await getInstalledAddons();

    // Try addons that support meta for this type  
    const metaAddons = addons.filter((a) =>
      addonSupportsResource(a, "meta", type)
    );

    for (const addon of metaAddons) {
      const data = await fetchAddonResource<StremioMetaResponse>(
        addon.transportUrl,
        `meta/${type}/${mediaItemId}.json`
      );

      if (data?.meta) {
        return fullMetaToMediaItem(data.meta, addon.transportUrl);
      }
    }

    return null;
  } catch (error) {
    console.error("Failed to fetch media details:", error);
    return null;
  }
}

// ─── Streams ─────────────────────────────────────────────────────

export async function fetchStreams(
  mediaItemId: string,
  type: string = "movie"
): Promise<StremioStream[]> {
  try {
    const targets = await getStreamAddonTargets(type);
    const results = await Promise.all(
      targets.map((target) =>
        fetchStreamsFromAddon(mediaItemId, type, target.transportUrl, target.name)
      )
    );
    return results.flat();
  } catch (error) {
    console.error("Failed to fetch streams:", error);
    return [];
  }
}

export interface StreamAddonTarget {
  id: string;
  name: string;
  transportUrl: string;
}

export async function getStreamAddonTargets(
  type: string = "movie"
): Promise<StreamAddonTarget[]> {
  try {
    const addons = await getInstalledAddons();

    return addons
      .filter((addon) => addonSupportsResource(addon, "stream", type))
      .map((addon) => ({
        id: addon.manifest.id || addon.transportUrl,
        name: addon.manifest.name || "Unknown addon",
        transportUrl: addon.transportUrl,
      }));
  } catch (error) {
    console.error("Failed to fetch stream addon targets:", error);
    return [];
  }
}

export async function fetchStreamsFromAddon(
  mediaItemId: string,
  type: string = "movie",
  addonTransportUrl: string,
  addonName?: string
): Promise<StremioStream[]> {
  try {
    const streamRequestHeaders = {
      Referer: "https://web.stremio.com/",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
      Accept: "application/json, text/plain, */*",
    };

    const data = await fetchAddonResource<StremioStreamResponse>(
      addonTransportUrl,
      `stream/${type}/${mediaItemId}.json`,
      { headers: streamRequestHeaders, cache: "no-store" }
    );

    if (!data?.streams?.length) {
      return [];
    }

    return data.streams.map((stream) => ({
      ...stream,
      name: stream.name || addonName || "Unknown source",
    }));
  } catch (error) {
    console.error("Failed to fetch streams from addon:", error);
    return [];
  }
}

// ─── Similar / Related ──────────────────────────────────────────

export async function fetchSimilarItems(
  itemId: string,
  type: string = "movie",
  limit: number = 12
): Promise<MediaItem[]> {
  // Stremio doesn't have a direct "similar items" endpoint.
  // We can try fetching from the same catalog or use IMDB relations.
  // For now, return items from the same catalog type
  const items = await fetchCatalogItems(type, "top");
  return items.filter((item) => item.id !== itemId).slice(0, limit);
}

// ─── Library Items (Catalogs per addon) ─────────────────────────

export async function fetchLibraryItems(
  addonTransportUrl: string,
  limit: number = 50
): Promise<{ items: MediaItem[]; totalRecordCount: number }> {
  try {
    const addons = await getInstalledAddons();
    const addon = addons.find((a) => a.transportUrl === addonTransportUrl);

    if (!addon) return { items: [], totalRecordCount: 0 };

    const allItems: MediaItem[] = [];

    // Fetch all catalogs from this addon
    for (const catalog of addon.manifest.catalogs) {
      const data = await fetchAddonResource<StremioCatalogResponse>(
        addon.transportUrl,
        `catalog/${catalog.type}/${catalog.id}.json`
      );

      if (data?.metas) {
        for (const meta of data.metas) {
          allItems.push(metaPreviewToMediaItem(meta, addon.transportUrl));
        }
      }
    }

    return {
      items: allItems.slice(0, limit),
      totalRecordCount: allItems.length,
    };
  } catch (error) {
    console.error("Failed to fetch library items:", error);
    return { items: [], totalRecordCount: 0 };
  }
}

// ─── Genres ──────────────────────────────────────────────────────

export async function fetchGenres(): Promise<{
  Items: { Name: string; Id: string }[];
}> {
  // Stremio doesn't have a direct genres endpoint.
  // We derive genres from catalog extra options if available.
  try {
    const addons = await getInstalledAddons();
    const genreSet = new Set<string>();

    for (const addon of addons) {
      for (const catalog of addon.manifest.catalogs) {
        const genreExtra = catalog.extra?.find((e) => e.name === "genre");
        if (genreExtra?.options) {
          genreExtra.options.forEach((g) => genreSet.add(g));
        }
      }
    }

    return {
      Items: Array.from(genreSet).map((name) => ({ Name: name, Id: name })),
    };
  } catch (error) {
    console.error("Failed to fetch genres:", error);
    return { Items: [] };
  }
}

export async function fetchGenre(
  genreName: string
): Promise<{ Name: string; Id: string } | null> {
  const genres = await fetchGenres();
  const target = genreName.trim().toLowerCase();
  return (
    genres.Items.find((genre) => genre.Name.toLowerCase() === target) || null
  );
}

// ─── Playback Reporting ──────────────────────────────────────────
// Stremio doesn't have server-side playback tracking.
// These are no-ops kept for interface compatibility.

export async function reportPlaybackStart(): Promise<boolean> {
  return true;
}

export async function reportPlaybackProgress(): Promise<boolean> {
  return true;
}

export async function reportPlaybackStopped(): Promise<boolean> {
  return true;
}

// ─── Resume Items ────────────────────────────────────────────────
// Stremio's continue watching is managed client-side or via libraryItems API.

export async function fetchResumeItems(): Promise<MediaItem[]> {
  try {
    const { authKey } = await getAuthData();
    const response = await fetch(`${STREMIO_API}/datastoreGet`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        authKey,
        collection: "libraryItem",
        ids: [],
        all: true,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      console.error("Failed to fetch resume items:", response.status);
      return [];
    }

    const data = await response.json();
    const libraryItems = Array.isArray(data?.result) ? data.result : [];

    // Matches Stremio core's continue-watching rules:
    // type !== "other", (!removed || temp), and state.timeOffset > 0.
    const resumeItems = libraryItems
      .filter((item: any) => {
        const type = item?.type;
        const removed = Boolean(item?.removed);
        const temp = Boolean(item?.temp);
        const timeOffset = Number(
          item?.state?.timeOffset ?? item?.state?.timeWatched ?? 0
        );

        return type !== "other" && (!removed || temp) && timeOffset > 0;
      })
      .sort((a: any, b: any) => {
        const aLastWatched = new Date(
          a?.state?.lastWatched ?? a?._mtime ?? 0
        ).getTime();
        const bLastWatched = new Date(
          b?.state?.lastWatched ?? b?._mtime ?? 0
        ).getTime();
        return bLastWatched - aLastWatched;
      })
      .map((item: any): MediaItem => ({
        id: item.id ?? item._id,
        type:
          item.type === "movie" || item.type === "series"
            ? item.type
            : "movie",
        name: item.name,
        poster: item.poster,
        background: item.background,
        progressPercent:
          Number(item?.state?.duration ?? 0) > 0
            ? Math.max(
                0,
                Math.min(
                  100,
                  Math.round(
                    (Number(
                      item?.state?.timeOffset ?? item?.state?.timeWatched ?? 0
                    ) /
                      Number(item?.state?.duration)) *
                      100
                  )
                )
              )
            : undefined,
      }))
      .slice(0, 24)
      .map((item: MediaItem) => {
        const raw = libraryItems.find(
          (candidate: any) => (candidate.id ?? candidate._id) === item.id
        );
        const videoId = raw?.state?.video_id ?? raw?.state?.videoId;
        const episodeMatch =
          typeof videoId === "string" ? videoId.match(/:(\d+):(\d+)$/) : null;
        const seasonEpisodeLabel = episodeMatch
          ? `S${Number(episodeMatch[1])} • E${Number(episodeMatch[2])}`
          : null;

        return {
          ...item,
          progressLabel: seasonEpisodeLabel || undefined,
          releaseInfo: seasonEpisodeLabel || undefined,
        };
      });

    const enriched = await Promise.all(
      resumeItems.map(async (item: MediaItem) => {
        try {
          const details = await fetchMediaDetails(item.id, item.type);
          return {
            ...item,
            background: details?.background || item.background || details?.poster,
            poster: item.poster || details?.poster,
            logo: details?.logo || item.logo,
          };
        } catch {
          return item;
        }
      })
    );

    return enriched;
  } catch (error) {
    console.error("Failed to fetch resume items:", error);
    return [];
  }
}

// ─── Library Scan (No-op for Stremio) ────────────────────────────

export async function scanLibrary(): Promise<void> {
  // No server-side library scan in Stremio
}
