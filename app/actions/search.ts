"use server";

import type {
  StremioAddon,
  StremioCatalogResponse,
  StremioMetaPreview,
  MediaItem,
  SearchResult,
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
    const response = await fetch(url, { next: { revalidate: 60 } });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

// ─── Search ──────────────────────────────────────────────────────

export async function searchItems(query: string): Promise<SearchResult[]> {
  if (!query.trim()) return [];

  try {
    const addons = await getInstalledAddons();
    const results: SearchResult[] = [];
    const seenIds = new Set<string>();

    // Search through catalogs that support the "search" extra
    const searchPromises: Promise<void>[] = [];

    for (const addon of addons) {
      for (const catalog of addon.manifest.catalogs) {
        const searchExtra = catalog.extra?.find((e) => e.name === "search");
        if (!searchExtra) continue;

        const promise = (async () => {
          const encodedQuery = encodeURIComponent(query);
          const data = await fetchAddonResource<StremioCatalogResponse>(
            addon.transportUrl,
            `catalog/${catalog.type}/${catalog.id}/search=${encodedQuery}.json`
          );

          if (data?.metas) {
            for (const meta of data.metas) {
              if (seenIds.has(meta.id)) continue;
              seenIds.add(meta.id);

              results.push({
                id: meta.id,
                type: meta.type,
                name: meta.name,
                poster: meta.poster,
                description: meta.description,
                releaseInfo: meta.releaseInfo,
                imdbRating: meta.imdbRating,
                addonName: addon.manifest.name,
              });
            }
          }
        })();

        searchPromises.push(promise);
      }
    }

    await Promise.all(searchPromises);

    // Sort: movies first, then series, then everything else
    const typePriority: Record<string, number> = {
      movie: 1,
      series: 2,
      channel: 3,
      tv: 4,
    };

    results.sort((a, b) => {
      const ap = typePriority[a.type] || 99;
      const bp = typePriority[b.type] || 99;
      return ap - bp;
    });

    return results;
  } catch (error) {
    console.error("Failed to search items:", error);
    return [];
  }
}

export async function searchPeople(
  _query: string
): Promise<SearchResult[]> {
  // Stremio does not have a people/person search API.
  // Person data is embedded in meta objects (cast, director, etc.)
  return [];
}
