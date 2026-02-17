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
