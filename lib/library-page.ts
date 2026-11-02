import type { MediaItem } from "@/types/stremio";

export const LIBRARY_PAGE_SIZE = 48;
export type LibrarySort = "name" | "rating" | "year" | "random";
export interface LibraryQuery { search: string; sort: LibrarySort; order: "asc" | "desc"; page: number; seed: number }
export interface LibraryPageData {
    items: MediaItem[];
    totalRecordCount: number;
    totalLibraryCount: number;
    page: number;
    pageSize: number;
}
export const INITIAL_LIBRARY_QUERY: LibraryQuery = { search: "", sort: "name", order: "asc", page: 1, seed: 0 };

export function parseLibraryQuery(params: URLSearchParams): LibraryQuery {
    const page = Number(params.get("page") ?? 1);
    const seed = Number(params.get("seed") ?? 0);
    const sort = params.get("sort");
    return {
        search: (params.get("q") ?? "").trim().slice(0, 300),
        sort: ["name", "rating", "year", "random"].includes(sort ?? "") ? sort as LibrarySort : "name",
        order: params.get("order") === "desc" ? "desc" : "asc",
        page: Number.isSafeInteger(page) && page > 0 ? page : 1,
        seed: Number.isSafeInteger(seed) ? seed >>> 0 : 0,
    };
}
export function libraryQueryParams(query: LibraryQuery): URLSearchParams {
    return new URLSearchParams({ q: query.search, sort: query.sort, order: query.order, page: String(query.page), seed: String(query.seed) });
}
export function selectLibraryPage(items: MediaItem[], query: LibraryQuery): LibraryPageData {
    const search = query.search.toLocaleLowerCase();
    let sorted = query.sort === "random" ? [] : items.filter(item => (item.name || "").toLocaleLowerCase().includes(search));
    if (query.sort === "random") {
        // A seeded Fisher–Yates order stays consistent across pages and queries.
        // Shuffle the complete collection first, then filter, below.
        const shuffled = [...items];
        let state = query.seed;
        for (let i = shuffled.length - 1; i > 0; i--) {
            state = (state + 0x6D2B79F5) | 0;
            let value = Math.imul(state ^ (state >>> 15), 1 | state);
            value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
            const j = Math.floor((((value ^ (value >>> 14)) >>> 0) / 4294967296) * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        sorted = shuffled.filter(item => (item.name || "").toLocaleLowerCase().includes(search));
    } else {
        const direction = query.order === "desc" ? -1 : 1;
        sorted.sort((a, b) => {
            let comparison = 0;
            if (query.sort === "name") comparison = (a.name || "").localeCompare(b.name || "");
            if (query.sort === "rating") comparison = (Number(a.imdbRating) || 0) - (Number(b.imdbRating) || 0);
            if (query.sort === "year") comparison = (a.year || Number.parseInt(a.releaseInfo || "", 10) || 0) - (b.year || Number.parseInt(b.releaseInfo || "", 10) || 0);
            return direction * comparison || `${a.type}:${a.id}`.localeCompare(`${b.type}:${b.id}`);
        });
    }
    const page = Math.min(query.page, Math.max(1, Math.ceil(sorted.length / LIBRARY_PAGE_SIZE)));
    return { items: sorted.slice((page - 1) * LIBRARY_PAGE_SIZE, page * LIBRARY_PAGE_SIZE),
        totalRecordCount: sorted.length, totalLibraryCount: items.length, page, pageSize: LIBRARY_PAGE_SIZE };
}
