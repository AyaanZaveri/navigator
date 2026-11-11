import type { MediaItem } from "@/types/stremio";

export type SearchMediaFilter = "all" | "movie" | "series";

export interface SearchResultPage {
    results: MediaItem[];
    totalPages: number;
    totalResults: number;
}

export interface SearchResultSet {
    page: number;
    all: SearchResultPage;
    movie: SearchResultPage;
    series: SearchResultPage;
}

export function searchMediaFilter(value?: string): SearchMediaFilter {
    return value === "movie" || value === "series" ? value : "all";
}

export function searchPageUrl(query: string, filter: SearchMediaFilter = "all", page = 1) {
    const params = new URLSearchParams({ q: query });
    if (filter !== "all") params.set("type", filter);
    if (page > 1) params.set("page", String(page));
    return `/search?${params}`;
}
