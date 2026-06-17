"use server";

import type {
  StremioCatalogResponse,
  SearchCatalogSection,
  SearchResult,
} from "@/types/stremio";
import { getInstalledAddons } from "./auth";
import { cache } from "react";

// ─── Helpers ─────────────────────────────────────────────────────

const ADDON_CATALOG_TIMEOUT_MS = 3_500;
const QUICK_SEARCH_RESPONSE_MS = 1_500;

async function fetchAddonResource<T>(
  transportUrl: string,
  path: string,
  timeoutMs = ADDON_CATALOG_TIMEOUT_MS
): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const base = transportUrl.replace(/\/manifest\.json$/, "");
    const url = `${base}/${path}`;
    const response = await fetch(url, {
      next: { revalidate: 60 },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
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

function sortSearchResults(results: SearchResult[]): SearchResult[] {
  const typePriority: Record<string, number> = {
    movie: 1,
    series: 2,
    channel: 3,
    tv: 4,
  };

  return [...results].sort((a, b) => {
    const ap = typePriority[a.type] || 99;
    const bp = typePriority[b.type] || 99;
    return ap - bp;
  });
}

async function collectSearchResults(
  query: string,
  options: { returnEarlyWithResults?: boolean } = {}
): Promise<SearchResult[]> {
  const addons = await getInstalledAddonsCached();
  const results: SearchResult[] = [];
  const seenIds = new Set<string>();
  const encodedQuery = encodeURIComponent(query);

  const addMetas = (
    metas: StremioCatalogResponse["metas"] | undefined,
    addonName: string,
    catalogId?: string,
    catalogName?: string
  ) => {
    if (!metas) return;

    for (const meta of metas) {
      if (seenIds.has(meta.id)) continue;
      seenIds.add(meta.id);
      results.push(mapMetaToSearchResult(meta, addonName, catalogId, catalogName));
    }
  };

  const searchPromises = addons.flatMap((addon) =>
    getSearchableCatalogs(addon).map(async (catalog) => {
      const data = await fetchAddonResource<StremioCatalogResponse>(
        addon.transportUrl,
        `catalog/${catalog.type}/${catalog.id}/search=${encodedQuery}.json`
      );
      addMetas(data?.metas, addon.manifest.name, catalog.id, catalog.id);
    })
  );

  if (searchPromises.length === 0) return [];

  if (!options.returnEarlyWithResults) {
    await Promise.allSettled(searchPromises);
    return sortSearchResults(results);
  }

  await new Promise<void>((resolve) => {
    let settledCount = 0;
    let resolved = false;
    const resolveOnce = () => {
      if (resolved) return;
      resolved = true;
      resolve();
    };

    const timer = setTimeout(() => {
      if (results.length > 0) resolveOnce();
    }, QUICK_SEARCH_RESPONSE_MS);

    searchPromises.forEach((promise) => {
      promise.finally(() => {
        settledCount += 1;

        if (settledCount === searchPromises.length) {
          clearTimeout(timer);
          resolveOnce();
        }
      });
    });
  });

  return sortSearchResults(results);
}

// ─── Search ──────────────────────────────────────────────────────

export async function searchItems(query: string): Promise<SearchResult[]> {
  if (!query.trim()) return [];

  try {
    return collectSearchResults(query, { returnEarlyWithResults: true });
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

    const sectionResults = await Promise.allSettled(
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

    return sectionResults
      .map((result) => (result.status === "fulfilled" ? result.value : null))
      .filter((section): section is SearchCatalogSection => section !== null);
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
