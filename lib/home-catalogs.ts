import type { MediaItem } from "@/types/stremio";

export const INITIAL_CATALOG_COUNT = 4;
export const CATALOG_BATCH_SIZE = 2;

export interface HomeCatalogEntry {
  key: string;
  sectionName: string;
  catalogType: string;
  catalogId: string;
  addonTransportUrl: string;
}

export interface HomeCatalogSection {
  key: string;
  sectionName: string;
  mediaItems: MediaItem[];
}

export type HomeCatalogResult = { status: "ready"; section: HomeCatalogSection | null } | { status: "error" };
export interface InitialHomeCatalog {
  key: string;
  sectionName: string;
  result: Promise<HomeCatalogResult>;
  retry?: { catalog: HomeCatalogEntry } | { feed: string };
}
