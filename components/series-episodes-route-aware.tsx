"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { SeasonEpisodes } from "@/components/season-episodes";
import type { StremioVideo, MediaItem } from "@/types/stremio";

interface SeriesEpisodesRouteAwareProps {
  showId: string;
  prefetchedVideos?: StremioVideo[];
  prefetchedSeasons?: MediaItem["seasons"];
}

function toPositiveInt(value: string | undefined, minimum = 1): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum) return undefined;
  return parsed;
}

export function SeriesEpisodesRouteAware({
  showId,
  prefetchedVideos,
  prefetchedSeasons,
}: SeriesEpisodesRouteAwareProps) {
  const params = useParams<{ season?: string; episode?: string }>();

  const currentSeasonNumber = useMemo(
    () => toPositiveInt(params?.season, 0),
    [params?.season]
  );
  const currentEpisodeNumber = useMemo(
    () => toPositiveInt(params?.episode),
    [params?.episode]
  );

  return (
    <SeasonEpisodes
      showId={showId}
      prefetchedVideos={prefetchedVideos}
      initialSeasons={prefetchedSeasons}
      currentSeasonNumber={currentSeasonNumber}
      currentEpisodeNumber={currentEpisodeNumber}
    />
  );
}
