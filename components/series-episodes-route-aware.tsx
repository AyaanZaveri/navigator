"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { SeasonEpisodes } from "@/components/season-episodes";
import type { StremioVideo } from "@/types/stremio";

interface SeriesEpisodesRouteAwareProps {
  showId: string;
  prefetchedVideos?: StremioVideo[];
}

function toPositiveInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return undefined;
  return parsed;
}

export function SeriesEpisodesRouteAware({
  showId,
  prefetchedVideos,
}: SeriesEpisodesRouteAwareProps) {
  const params = useParams<{ season?: string; episode?: string }>();

  const currentSeasonNumber = useMemo(
    () => toPositiveInt(params?.season),
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
      currentSeasonNumber={currentSeasonNumber}
      currentEpisodeNumber={currentEpisodeNumber}
    />
  );
}
