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

export function searchPageUrl(query: string, filter: SearchMediaFilter = "all") {
    const params = new URLSearchParams({ q: query });
    if (filter !== "all") params.set("type", filter);
    return `/search?${params}`;
}
