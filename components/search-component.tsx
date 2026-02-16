"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  listSearchAddonTargets,
  searchCatalogSectionsForAddon,
  searchItems,
} from "@/app/actions";
import { SearchSuggestionItem } from "./search-suggestion-item";
import { useMediaPlayer } from "@/contexts/MediaPlayerContext";
import { Kbd } from "@/components/ui/kbd";
import { TextShimmer } from "./motion-primitives/text-shimmer";
import { SidebarTrigger } from "@/components/ui/sidebar";
import type { SearchResult } from "@/types/stremio";

interface SearchBarProps {
  className?: string;
  initialQuery?: string;
}

export function SearchBar({ className = "", initialQuery = "" }: SearchBarProps) {
  const [searchQuery, setSearchQuery] = useState(initialQuery.trim());
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [addonsLoadingCount, setAddonsLoadingCount] = useState(0);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isPlayerVisible } = useMediaPlayer();
  const searchTimeout = useRef<NodeJS.Timeout | null>(null);
  const searchRequestIdRef = useRef(0);
  const skipNextSuggestSearchRef = useRef(false);
  const lastAppliedUrlQueryRef = useRef<string | null>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const urlQuery = (searchParams.get("q") ?? "").trim();

  const loadingComponent = useMemo(
    () => (
      <div className="flex justify-center items-center p-8">
        <TextShimmer className="text-sm font-mono">
          Searching...
        </TextShimmer>
      </div>
    ),
    []
  );

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

  const getMetadataQualityScore = (item: Pick<SearchResult, "poster" | "imdbRating">): number => {
    let score = 0;
    if (item.poster) score += 10;
    if (item.imdbRating) {
      const parsed = Number(item.imdbRating);
      if (!Number.isNaN(parsed)) score += parsed;
    }
    return score;
  };

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
    setShowSuggestions(false);
    setIsLoading(false);
    setAddonsLoadingCount(0);
  }, [pathname, urlQuery, initialQuery]);

  // Debounced search
  useEffect(() => {
    if (skipNextSuggestSearchRef.current) {
      skipNextSuggestSearchRef.current = false;
      return;
    }

    if (searchTimeout.current) {
      clearTimeout(searchTimeout.current);
    }

    if (searchQuery.trim().length > 2) {
      setIsLoading(true);
      setShowSuggestions(true);
      const requestId = ++searchRequestIdRef.current;
      searchTimeout.current = setTimeout(async () => {
        try {
          const trimmedQuery = searchQuery.trim();
          const addonTargets = await listSearchAddonTargets();
          if (requestId !== searchRequestIdRef.current) return;

          if (addonTargets.length === 0) {
            const results = await searchItems(trimmedQuery);
            if (requestId !== searchRequestIdRef.current) return;
            setSuggestions(results.slice(0, 6));
            return;
          }

          const bestById = new Map<
            string,
            { result: SearchResult; relevanceScore: number }
          >();
          setAddonsLoadingCount(addonTargets.length);

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

          await Promise.all(
            addonTargets.map(async (target) => {
              try {
                const sections = await searchCatalogSectionsForAddon(
                  trimmedQuery,
                  target.transportUrl
                );
                if (requestId !== searchRequestIdRef.current) return;

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

                    const existing = bestById.get(item.id);
                    if (!existing || relevanceScore > existing.relevanceScore) {
                      bestById.set(item.id, { result: item, relevanceScore });
                    }
                  });
                }

                publishSuggestions();
              } catch (error) {
                console.error("Addon search failed:", error);
              } finally {
                if (requestId !== searchRequestIdRef.current) return;
                setAddonsLoadingCount((count) => Math.max(0, count - 1));
              }
            })
          );
        } catch (error) {
          console.error("Search failed:", error);
          setSuggestions([]);
        } finally {
          if (requestId !== searchRequestIdRef.current) return;
          setIsLoading(false);
          setAddonsLoadingCount(0);
        }
      }, 300);
    } else {
      searchRequestIdRef.current += 1;
      setSuggestions([]);
      setShowSuggestions(false);
      setIsLoading(false);
      setAddonsLoadingCount(0);
    }

    return () => {
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

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setShowSuggestions(false);
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch(e);
    else if (e.key === "Escape") setShowSuggestions(false);
  };

  const handleSuggestionClick = (item: SearchResult) => {
    setShowSuggestions(false);
    if (item.type === "movie") {
      router.push(`/movie/${item.id}`);
    } else if (item.type === "series") {
      router.push(`/series/${item.id}`);
    } else {
      router.push(`/search?q=${encodeURIComponent(item.name)}`);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    if (e.target.value.trim().length > 2) setShowSuggestions(true);
  };

  if (isPlayerVisible) return null;

  return (
    <div
      className={`relative z-[9999] md:max-w-xl ${className}`}
      ref={suggestionsRef}
    >
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="md:hidden">
          <SidebarTrigger className="dark:bg-background/70! bg-background/90 border-border border text-foreground hover:bg-accent rounded-2xl h-11 w-11 p-0 backdrop-blur-sm" />
        </div>

        <InputGroup className="flex-1 h-11 rounded-2xl md:rounded-xl border-border text-foreground backdrop-blur-md dark:bg-background/70! bg-background/90 shadow-none">
          <InputGroupAddon>
            <Search className="h-4 w-4 text-muted-foreground" />
          </InputGroupAddon>
          <InputGroupInput
            ref={inputRef}
            type="text"
            placeholder="Search movies and TV shows..."
            value={searchQuery}
            onChange={handleInputChange}
            onKeyDown={handleInputKeyDown}
            onFocus={() => {
              if (searchQuery.trim().length > 2 && suggestions.length > 0) {
                setShowSuggestions(true);
              }
            }}
            className="h-11 text-foreground placeholder:text-muted-foreground"
          />
          <InputGroupAddon align="inline-end" className="pr-3 has-[>kbd]:mr-0">
            <Kbd>/</Kbd>
          </InputGroupAddon>
        </InputGroup>
      </form>

      {(showSuggestions || isLoading) && (
        <div className="absolute top-full left-0 right-0 mt-2 dark:bg-background/70! bg-background/90 backdrop-blur-md rounded-xl border shadow-xl shadow-accent/30 z-[9999] max-h-96 overflow-y-auto">
          {isLoading && suggestions.length === 0 && loadingComponent}

          {suggestions.length > 0 && (
            <div className="p-2">
              {suggestions.map((item) => (
                <SearchSuggestionItem
                  key={item.id}
                  item={item}
                  onClick={() => handleSuggestionClick(item)}
                />
              ))}
            </div>
          )}

          {!isLoading && suggestions.length === 0 && searchQuery.trim().length > 2 && (
              <div className="p-4 text-center text-muted-foreground">
                <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No results found for &ldquo;{searchQuery}&rdquo;</p>
              </div>
            )}
        </div>
      )}
    </div>
  );
}
