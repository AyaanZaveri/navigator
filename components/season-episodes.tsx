"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  fetchSeasons,
  fetchEpisodes,
  type Season,
  type Episode,
} from "@/app/actions/tv-shows";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Play } from "lucide-react";
import { ScrollArea, ScrollBar } from "./ui/scroll-area";
import { buildEpisodePath } from "@/lib/series-route";
import type { StremioVideo } from "@/types/stremio";

interface SeasonEpisodesProps {
  showId: string;
  prefetchedVideos?: StremioVideo[];
  currentSeasonNumber?: number;
  currentEpisodeNumber?: number;
}

// Cache episodes per series+season key
const episodesCache = new Map<string, Episode[]>();
const seasonsCache = new Map<string, Season[]>();

function getInitialSeasonState(showId: string, currentSeasonNumber?: number) {
  const cachedSeasons = seasonsCache.get(showId);
  const selectedSeason =
    currentSeasonNumber ??
    (cachedSeasons && cachedSeasons.length > 0 ? cachedSeasons[0].number : null);

  return {
    seasons: cachedSeasons ?? [],
    selectedSeason,
    loading: !cachedSeasons,
  };
}

function getInitialEpisodesState(showId: string, selectedSeason: number | null) {
  if (selectedSeason === null) {
    return [];
  }
  const cacheKey = `${showId}:${selectedSeason}`;
  return episodesCache.get(cacheKey) ?? [];
}

function normalizeVideosToEpisodes(
  showId: string,
  videos?: StremioVideo[]
): Episode[] {
  if (!videos?.length) return [];

  return videos
    .map((video) => {
      const season = video.season ?? 1;
      const episode = video.episode ?? 1;
      return {
        id: video.id || `${showId}:${season}:${episode}`,
        title: video.title || video.name || `Episode ${episode}`,
        season,
        episode,
        overview: video.overview,
        thumbnail: video.thumbnail,
        released: video.released,
      };
    })
    .sort((a, b) => {
      if (a.season !== b.season) {
        if (a.season === 0) return 1;
        if (b.season === 0) return -1;
        return a.season - b.season;
      }
      return a.episode - b.episode;
    });
}

function episodesToSeasons(episodes: Episode[]): Season[] {
  const seasonMap = new Map<number, number>();
  for (const episode of episodes) {
    seasonMap.set(episode.season, (seasonMap.get(episode.season) || 0) + 1);
  }

  return Array.from(seasonMap.entries())
    .sort(([a], [b]) => {
      if (a === 0) return 1;
      if (b === 0) return -1;
      return a - b;
    })
    .map(([number, episodeCount]) => ({
      number,
      name: number === 0 ? "Special" : `Season ${number}`,
      episodeCount,
    }));
}

export const SeasonEpisodes = React.memo(function SeasonEpisodes({
  showId,
  prefetchedVideos,
  currentSeasonNumber,
  currentEpisodeNumber,
}: SeasonEpisodesProps) {
  const prefetchedEpisodes = useMemo(
    () => normalizeVideosToEpisodes(showId, prefetchedVideos),
    [showId, prefetchedVideos]
  );
  const hasPrefetchedEpisodes = prefetchedEpisodes.length > 0;
  const prefetchedSeasons = useMemo(
    () => episodesToSeasons(prefetchedEpisodes),
    [prefetchedEpisodes]
  );

  const initialSeasonState = hasPrefetchedEpisodes
    ? {
        seasons: prefetchedSeasons,
        selectedSeason:
          currentSeasonNumber ??
          (prefetchedSeasons.length > 0 ? prefetchedSeasons[0].number : null),
        loading: false,
      }
    : getInitialSeasonState(showId, currentSeasonNumber);

  const initialEpisodes = hasPrefetchedEpisodes
    ? initialSeasonState.selectedSeason === null
      ? []
      : prefetchedEpisodes.filter(
          (episode) => episode.season === initialSeasonState.selectedSeason
        )
    : getInitialEpisodesState(showId, initialSeasonState.selectedSeason);

  const [seasons, setSeasons] = useState<Season[]>(initialSeasonState.seasons);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(
    initialSeasonState.selectedSeason
  );
  const [loading, setLoading] = useState(initialSeasonState.loading);
  const [episodes, setEpisodes] = useState<Episode[]>(initialEpisodes);
  const [episodesLoading, setEpisodesLoading] = useState(false);
  const episodesBottomSpacingClass = currentEpisodeNumber ? "mb-4" : "mb-8";
  const lastScrolledEpisodeRef = useRef<string | null>(null);
  const scrollContentRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (hasPrefetchedEpisodes) {
      setLoading(false);
      setSeasons(prefetchedSeasons);
      const initial =
        currentSeasonNumber ??
        (prefetchedSeasons.length > 0 ? prefetchedSeasons[0].number : null);
      setSelectedSeason(initial);
      return;
    }

    let cancelled = false;

    const loadSeasons = async () => {
      const cacheKey = showId;
      if (seasonsCache.has(cacheKey)) {
        const cached = seasonsCache.get(cacheKey)!;
        if (cancelled) return;
        setLoading(false);
        setSeasons(cached);
        const initial =
          currentSeasonNumber ??
          (cached.length > 0 ? cached[0].number : null);
        setSelectedSeason(initial);
        return;
      }

      setLoading(true);
      try {
        const seasonsData = await fetchSeasons(showId);
        if (cancelled) return;
        seasonsCache.set(cacheKey, seasonsData);
        setSeasons(seasonsData);
        const initial =
          currentSeasonNumber ??
          (seasonsData.length > 0 ? seasonsData[0].number : null);
        setSelectedSeason(initial);
      } catch (error) {
        console.error("Failed to fetch seasons:", error);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadSeasons();

    return () => {
      cancelled = true;
    };
  }, [showId, currentSeasonNumber, hasPrefetchedEpisodes, prefetchedSeasons]);

  useEffect(() => {
    if (!currentSeasonNumber) {
      return;
    }

    setSelectedSeason((previousSeason) =>
      previousSeason === currentSeasonNumber
        ? previousSeason
        : currentSeasonNumber
    );
  }, [currentSeasonNumber]);

  useEffect(() => {
    if (selectedSeason === null) {
      setEpisodes([]);
      setEpisodesLoading(false);
      return;
    }

    if (hasPrefetchedEpisodes) {
      setEpisodes(
        prefetchedEpisodes.filter((episode) => episode.season === selectedSeason)
      );
      setEpisodesLoading(false);
      return;
    }

    let cancelled = false;
    const cacheKey = `${showId}:${selectedSeason}`;
    if (episodesCache.has(cacheKey)) {
      setEpisodes(episodesCache.get(cacheKey)!);
      setEpisodesLoading(false);
      return;
    }

    const loadEpisodes = async () => {
      setEpisodesLoading(true);
      try {
        const episodesData = await fetchEpisodes(showId, selectedSeason);
        if (cancelled) return;
        episodesCache.set(cacheKey, episodesData);
        setEpisodes(episodesData);
      } catch (error) {
        console.error("Failed to fetch episodes:", error);
      } finally {
        if (!cancelled) {
          setEpisodesLoading(false);
        }
      }
    };

    loadEpisodes();

    return () => {
      cancelled = true;
    };
  }, [showId, selectedSeason, hasPrefetchedEpisodes, prefetchedEpisodes]);

  useEffect(() => {
    if (
      episodesLoading ||
      !currentSeasonNumber ||
      !currentEpisodeNumber ||
      selectedSeason !== currentSeasonNumber
    ) {
      return;
    }

    const key = `${currentSeasonNumber}:${currentEpisodeNumber}`;
    if (lastScrolledEpisodeRef.current === key) {
      return;
    }

    const element = document.querySelector(
      `[data-episode-key="${key}"]`
    ) as HTMLElement | null;

    if (element) {
      const viewport =
        viewportRef.current ??
        (element
          .closest('[data-slot="scroll-area"]')
          ?.querySelector(
            '[data-slot="scroll-area-viewport"]'
          ) as HTMLDivElement | null);

      if (viewport) {
        const targetLeft =
          element.offsetLeft - (viewport.clientWidth - element.clientWidth) / 2;

        viewport.scrollTo({
          left: Math.max(0, targetLeft),
          behavior: "smooth",
        });
      }

      lastScrolledEpisodeRef.current = key;
    }
  }, [episodes, episodesLoading, currentSeasonNumber, currentEpisodeNumber, selectedSeason]);

  useEffect(() => {
    if (!scrollContentRef.current) return;
    const viewport = scrollContentRef.current
      .closest('[data-slot="scroll-area"]')
      ?.querySelector('[data-slot="scroll-area-viewport"]') as HTMLDivElement | null;
    viewportRef.current = viewport;
  }, [episodesLoading, episodes, selectedSeason]);

  const scrollLeft = () => {
    if (!viewportRef.current) return;
    viewportRef.current.scrollBy({ left: -300, behavior: "smooth" });
  };

  const scrollRight = () => {
    if (!viewportRef.current) return;
    viewportRef.current.scrollBy({ left: 300, behavior: "smooth" });
  };

  if (loading) {
    return (
      <div className="mt-3">
        <div className="space-y-6">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-10 w-48" />
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (seasons.length === 0) {
    return (
      <div className="mt-3 text-muted-foreground">No seasons available</div>
    );
  }

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between gap-4 mb-6 px-1">
        <div className="relative z-[9999]">
          <Select
            value={selectedSeason?.toString() ?? ""}
            onValueChange={(val) => setSelectedSeason(Number(val))}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select season" />
            </SelectTrigger>
            <SelectContent className="z-[9999]">
              {seasons.map((season) => (
                <SelectItem
                  key={season.number}
                  value={season.number.toString()}
                >
                  {season.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 pr-4">
          <Button
            variant="outline"
            size="sm"
            className="bg-background/10 border-border text-foreground hover:bg-accent p-2"
            onClick={scrollLeft}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="bg-background/10 border-border text-foreground hover:bg-accent p-2"
            onClick={scrollRight}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {episodesLoading ? (
        <ScrollArea className="w-full whitespace-nowrap -ml-3">
          <div
            ref={scrollContentRef}
            className={`flex w-max space-x-4 ${episodesBottomSpacingClass} px-4`}
          >
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="shrink-0 w-72">
                <div className="space-y-3 py-2">
                  <div className="relative aspect-video rounded-lg overflow-hidden bg-muted shadow-lg">
                    <Skeleton className="w-full h-full" />
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-full" />
                    <Skeleton className="h-4 w-5/6" />
                    <div className="flex items-center gap-2 mt-2.5">
                      <Skeleton className="h-6 w-16 rounded-md" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <ScrollBar orientation="horizontal" className="opacity-0" />
        </ScrollArea>
      ) : episodes.length === 0 ? (
        <div className="text-muted-foreground">
          No episodes found for this season
        </div>
      ) : (
        <ScrollArea className="w-full rounded-md -ml-3">
          <div
            ref={scrollContentRef}
            className={`flex w-max space-x-4 ${episodesBottomSpacingClass} px-4`}
          >
            {episodes.map((episode) => (
              <EpisodeCard
                key={episode.id}
                episode={episode}
                showId={showId}
                isActive={
                  selectedSeason === currentSeasonNumber &&
                  episode.episode === currentEpisodeNumber
                }
              />
            ))}
          </div>
          <ScrollBar orientation="horizontal" className="opacity-0" />
        </ScrollArea>
      )}
    </div>
  );
});

const EpisodeCard = React.memo(function EpisodeCard({
  episode,
  showId,
  isActive = false,
}: {
  episode: Episode;
  showId: string;
  isActive?: boolean;
}) {
  const formatDate = useCallback((dateString: string | undefined) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return null;
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }, []);

  return (
    <div
      className="shrink-0 w-72 group"
      data-episode-id={episode.id}
      data-episode-key={`${episode.season}:${episode.episode}`}
    >
      <Link
        href={buildEpisodePath(showId, episode.season, episode.episode)}
        className="block"
        draggable={false}
        scroll={false}
      >
        <div className="space-y-3 py-2">
          {/* Episode Thumbnail */}
          <div
            className={`relative aspect-video rounded-lg overflow-hidden bg-muted shadow-lg group-hover:shadow-xl transition-all duration-300 ${isActive ? "ring-2 ring-primary ring-offset-3 ring-offset-background shadow-xl shadow-primary/25" : ""}`}
          >
            {episode.thumbnail ? (
              <img
                src={episode.thumbnail}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                <Play className="h-12 w-12" />
              </div>
            )}

            {/* Play button overlay */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all duration-300 flex items-center justify-center">
              <div className="invisible group-hover:visible transition-opacity duration-300">
                <div className="bg-white/20 backdrop-blur-sm rounded-full p-3 hover:bg-white/30 transition-colors">
                  <Play className="h-6 w-6 text-white fill-white" />
                </div>
              </div>
            </div>
          </div>

          {/* Episode Info */}
          <div className="space-y-2">
            <h3 className="font-semibold text-base leading-tight line-clamp-2 group-hover:text-primary transition-colors break-words pt-1">
              {episode.title || "Untitled Episode"}
            </h3>

            {episode.overview && (
              <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3 break-words">
                {episode.overview}
              </p>
            )}

            <div className="flex items-center gap-2 flex-wrap mt-2.5">
              <Badge variant="outline" className="text-xs bg-sidebar">
                S{episode.season} &bull; E{episode.episode}
              </Badge>
              {formatDate(episode.released) && (
                <Badge variant="outline" className="text-xs bg-sidebar">
                  {formatDate(episode.released)}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
});
