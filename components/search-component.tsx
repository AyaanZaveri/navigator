"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Film, Tv } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { fetchSearchSuggestions } from "@/lib/search-catalog-stream";
import { ExpandingSearch, type ExpandingSearchItem } from "@/components/arc/expanding-search/expanding-search";
import { useIsPlayerVisible } from "@/contexts/MediaPlayerContext";
import type { SearchResult } from "@/types/stremio";

const normalizeText = (value: string): string =>
    value
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[^\w\s]|_/g, " ")
        .replace(/\s+/g, " ")
        .trim();

const getNameRelevanceScore = (query: string, name: string): number => {
    const normalizedQuery = normalizeText(query);
    const normalizedName = normalizeText(name);
    if (!normalizedQuery || !normalizedName) return 0;

    let score = 0;
    if (normalizedName === normalizedQuery) score += 1_000;
    else if (normalizedName.startsWith(normalizedQuery)) score += 700;
    else if (normalizedName.includes(normalizedQuery)) score += 450;

    const queryTokens = normalizedQuery.split(" ").filter(Boolean);
    const nameTokens = normalizedName.split(" ").filter(Boolean);
    for (const token of queryTokens) {
        if (nameTokens.includes(token)) score += 120;
        else if (nameTokens.some((nameToken) => nameToken.startsWith(token))) score += 65;
        else if (normalizedName.includes(token)) score += 30;
    }

    return score;
};

const getMetadataQualityScore = (item: Pick<SearchResult, "poster" | "imdbRating" | "communityRating">): number => {
    let score = 0;
    if (item.poster) score += 10;
    if (item.communityRating || item.imdbRating) {
        const parsed = Number(item.communityRating ?? item.imdbRating);
        if (!Number.isNaN(parsed)) score += parsed;
    }
    return score;
};

interface SearchBarProps {
  className?: string;
  initialQuery?: string;
}

export function SearchBar({ className = "", initialQuery = "" }: SearchBarProps) {
    const [searchQuery, setSearchQuery] = useState(initialQuery.trim());
    const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchError, setSearchError] = useState<string | null>(null);
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const isPlayerVisible = useIsPlayerVisible();
    const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
    const searchRequestIdRef = useRef(0);
    const skipNextSuggestSearchRef = useRef(false);
    const lastAppliedUrlQueryRef = useRef<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const urlQuery = (searchParams.get("q") ?? "").trim();

    useEffect(() => {
        if (isPlayerVisible) return;

        // Suggestions use router.push rather than Link. Warm the same full-route
        // cache as the catalog cards while the (at most six) results are shown.
        for (const item of suggestions) {
            if (item.type === "movie" || item.type === "series") {
                router.prefetch(`/${item.type}/${item.id}`);
            }
        }
    }, [suggestions, isPlayerVisible, router]);

    useEffect(() => {
        if (pathname !== "/search") {
            lastAppliedUrlQueryRef.current = null;
            return;
        }

        const queryFromUrl = (urlQuery || initialQuery).trim();
        if (lastAppliedUrlQueryRef.current === queryFromUrl) return;
        lastAppliedUrlQueryRef.current = queryFromUrl;

        skipNextSuggestSearchRef.current = true;
        searchRequestIdRef.current += 1;
        setSearchQuery(queryFromUrl);
        setSuggestions([]);
        setIsLoading(false);
    }, [pathname, urlQuery, initialQuery]);

    // Debounced search
    useEffect(() => {
        const controller = new AbortController();
        setSearchError(null);
        if (skipNextSuggestSearchRef.current) {
            skipNextSuggestSearchRef.current = false;
            return;
        }

        if (searchTimeout.current) {
            clearTimeout(searchTimeout.current);
        }

        if (searchQuery.trim().length > 2) {
            setIsLoading(true);
            const requestId = ++searchRequestIdRef.current;
            searchTimeout.current = setTimeout(async () => {
                let receivedResults = false;
                try {
                    const trimmedQuery = searchQuery.trim();
                    const bestById = new Map<
            string,
            { result: SearchResult; relevanceScore: number }
          >();

                    const publishSuggestions = () => {
                        const ranked = Array.from(bestById.values())
                            .sort((a, b) => {
                                if (b.relevanceScore !== a.relevanceScore) {
                                    return b.relevanceScore - a.relevanceScore;
                                }
                                return a.result.name.localeCompare(b.result.name);
                            })
                            .map(({ result }) => result)
                            .slice(0, 6);

                        setSuggestions(ranked);
                    };

                    await fetchSearchSuggestions(trimmedQuery, (sections) => {
                        if (requestId !== searchRequestIdRef.current) return;
                        receivedResults = true;
                        for (const section of sections) {
                            const sectionBoost =
                    section.catalogType === "movie" || section.catalogType === "series"
                        ? 10
                        : 0;
                            section.items.forEach((item, resultOrder) => {
                                const nameScore = getNameRelevanceScore(trimmedQuery, item.name);
                                const qualityScore = getMetadataQualityScore(item);
                                const providerRankScore = Math.max(0, 200 - resultOrder);
                                const relevanceScore =
                      nameScore + qualityScore + providerRankScore + sectionBoost;

                                const key = `${item.type}:${item.id}`;
                                const existing = bestById.get(key);
                                if (!existing || relevanceScore > existing.relevanceScore) {
                                    bestById.set(key, { result: item, relevanceScore });
                                }
                            });
                        }

                        publishSuggestions();
                    }, controller.signal);
                } catch (error) {
                    if (controller.signal.aborted) return;
                    console.error("Search failed:", error);
                    if (requestId === searchRequestIdRef.current && !receivedResults) {
                        setSuggestions([]);
                        setSearchError(error instanceof Error ? error.message : "TMDB search is unavailable.");
                    }
                } finally {
                    if (requestId === searchRequestIdRef.current) setIsLoading(false);
                }
            }, 300);
        } else {
            searchRequestIdRef.current += 1;
            setSuggestions([]);
            setIsLoading(false);
        }

        return () => {
            controller.abort();
            searchRequestIdRef.current += 1;
            if (searchTimeout.current) {
                clearTimeout(searchTimeout.current);
            }
        };
    }, [searchQuery]);

    // Global keyboard shortcut
    useEffect(() => {
        const handleGlobalKeyDown = (event: KeyboardEvent) => {
            if (
                event.key === "/" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !event.shiftKey &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA" &&
        !document.activeElement?.hasAttribute("contenteditable")
            ) {
                event.preventDefault();
                inputRef.current?.focus();
            }
        };
        document.addEventListener("keydown", handleGlobalKeyDown);
        return () => document.removeEventListener("keydown", handleGlobalKeyDown);
    }, []);

    const handleQueryChange = (query: string) => {
        skipNextSuggestSearchRef.current = false;
        searchRequestIdRef.current += 1;
        setSearchQuery(query);
        setSuggestions([]);
        setIsLoading(query.trim().length > 2);
    };

    const handleSearch = (query: string) => {
        if (query.trim()) router.push(`/search?q=${encodeURIComponent(query.trim())}`);
    };

    const handleSelect = (selected: ExpandingSearchItem) => {
        const item = suggestions.find(result => `${result.type}:${result.id}` === selected.id);
        if (!item) return;
        if (item.type === "movie" || item.type === "series") router.push(`/${item.type}/${item.id}`);
        else handleSearch(item.name);
    };

    const items = useMemo<ExpandingSearchItem[]>(() => suggestions.map(item => ({
        id: `${item.type}:${item.id}`,
        title: item.name,
        group: item.type === "movie" ? "Movies" : item.type === "series" ? "TV shows" : "More",
        meta: [item.year || item.releaseInfo, item.communityRating ? `${item.communityRating.toFixed(1)} ★` : item.imdbRating ? `${item.imdbRating} ★` : ""].filter(Boolean).join(" · "),
        icon: item.poster
            ? <img src={item.poster} alt="" draggable={false} loading="lazy" onError={event => { event.currentTarget.style.display = "none"; }} />
            : item.type === "movie" ? <Film size={18} /> : <Tv size={18} />,
    })), [suggestions]);

    if (isPlayerVisible) return null;

    return (
        <ExpandingSearch
            ref={inputRef}
            className={className}
            label="Search movies and TV shows"
            placeholder="Search movies and TV shows…"
            value={searchQuery}
            onValueChange={handleQueryChange}
            items={items}
            loading={isLoading}
            filterResults={false}
            minQueryLength={3}
            onSelect={handleSelect}
            onSubmit={handleSearch}
            emptyHint={searchError || "Try another title, or press Enter to see all results."}
            expandedWidth={576}
            persistent
            anchor="start"
        />
    );
}
