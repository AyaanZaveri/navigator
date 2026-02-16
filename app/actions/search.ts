"use server";

import type {
  StremioCatalogResponse,
  SearchCatalogSection,
  SearchResult,
} from "@/types/stremio";
import { getInstalledAddons } from "./auth";
import { cache } from "react";

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

type SearchableCatalog = {
  id: string;
  type: string;
};

type SearchAddonTarget = {
  transportUrl: string;
  addonName: string;
};

const getInstalledAddonsCached = cache(async () => getInstalledAddons());

function getSearchableCatalogs(addon: Awaited<ReturnType<typeof getInstalledAddons>>[number]): SearchableCatalog[] {
  return addon.manifest.catalogs
    .filter((catalog) => catalog.extra?.some((extra) => extra.name === "search"))
    .map((catalog) => ({
      id: catalog.id,
      type: catalog.type,
    }));
}

function mapMetaToSearchResult(
  meta: StremioCatalogResponse["metas"][number],
  addonName: string,
  catalogId?: string,
  catalogName?: string
): SearchResult {
  return {
    id: meta.id,
    type: meta.type,
    name: meta.name,
    poster: meta.poster,
    description: meta.description,
    releaseInfo: meta.releaseInfo,
    imdbRating: meta.imdbRating,
    addonName,
    catalogId,
    catalogName,
  };
}

// ─── Search ──────────────────────────────────────────────────────

export async function searchItems(query: string): Promise<SearchResult[]> {
  if (!query.trim()) return [];

  try {
    const addons = await getInstalledAddonsCached();
    const results: SearchResult[] = [];
    const seenIds = new Set<string>();

    // Search through catalogs that support the "search" extra
    const searchPromises: Promise<void>[] = [];

    for (const addon of addons) {
      for (const catalog of getSearchableCatalogs(addon)) {

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

              results.push(mapMetaToSearchResult(meta, addon.manifest.name));
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

export async function listSearchAddonTargets(): Promise<SearchAddonTarget[]> {
  try {
    const addons = await getInstalledAddonsCached();
    return addons
      .filter((addon) => getSearchableCatalogs(addon).length > 0)
      .map((addon) => ({
        transportUrl: addon.transportUrl,
        addonName: addon.manifest.name,
      }));
  } catch (error) {
    console.error("Failed to list searchable addons:", error);
    return [];
  }
}

export async function searchCatalogSectionsForAddon(
  query: string,
  transportUrl: string
): Promise<SearchCatalogSection[]> {
  if (!query.trim()) return [];

  try {
    const addons = await getInstalledAddonsCached();
    const addon = addons.find((candidate) => candidate.transportUrl === transportUrl);
    if (!addon) return [];

    const searchableCatalogs = getSearchableCatalogs(addon);
    const encodedQuery = encodeURIComponent(query);

    const sections = await Promise.all(
      searchableCatalogs.map(async (catalog) => {
        const data = await fetchAddonResource<StremioCatalogResponse>(
          addon.transportUrl,
          `catalog/${catalog.type}/${catalog.id}/search=${encodedQuery}.json`
        );
        if (!data?.metas?.length) return null;

        return {
          key: `${addon.manifest.id}:${catalog.type}:${catalog.id}`,
          title: `${addon.manifest.name} - ${catalog.id}`,
          catalogId: catalog.id,
          catalogType: catalog.type,
          items: data.metas.map((meta) =>
            mapMetaToSearchResult(meta, addon.manifest.name, catalog.id, catalog.id)
          ),
        } satisfies SearchCatalogSection;
      })
    );

    return sections.filter((section): section is SearchCatalogSection => section !== null);
  } catch (error) {
    console.error("Failed to search addon catalogs:", error);
    return [];
  }
}

export async function searchCatalogSections(
  query: string
): Promise<SearchCatalogSection[]> {
  if (!query.trim()) return [];

  try {
    const addonTargets = await listSearchAddonTargets();
    const sections = await Promise.all(
      addonTargets.map((target) =>
        searchCatalogSectionsForAddon(query, target.transportUrl)
      )
    );
    return sections.flat();
  } catch (error) {
    console.error("Failed to search catalog sections:", error);
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
