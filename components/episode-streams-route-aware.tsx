"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { MediaActions } from "@/components/media-actions";
import type { MediaItem, StremioVideo } from "@/types/stremio";

interface EpisodeStreamsRouteAwareProps {
  show: MediaItem;
  prefetchedVideos?: StremioVideo[];
}

function toPositiveInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function EpisodeStreamsRouteAware({
  show,
  prefetchedVideos,
}: EpisodeStreamsRouteAwareProps) {
  const params = useParams<{ season?: string; episode?: string }>();
  const seasonNumber = useMemo(
    () => toPositiveInt(params?.season),
    [params?.season]
  );
  const episodeNumber = useMemo(
    () => toPositiveInt(params?.episode),
    [params?.episode]
  );

  const episodeMedia = useMemo(() => {
    if (!seasonNumber || !episodeNumber || !prefetchedVideos?.length) {
      return null;
    }

    const selectedEpisode = prefetchedVideos.find(
      (video) =>
        video.season === seasonNumber && video.episode === episodeNumber
    );

    if (!selectedEpisode?.id) {
      return null;
    }

    const selectedEpisodeTitle =
      selectedEpisode.title ||
      selectedEpisode.name ||
      `Episode ${episodeNumber}`;

    return {
      ...show,
      id: selectedEpisode.id,
      seriesId: show.id,
      showName: show.name,
      episodeId: selectedEpisode.id,
      episodeTitle: selectedEpisodeTitle,
      seasonNumber,
      episodeNumber,
      type: "series",
      name: selectedEpisodeTitle,
      description: selectedEpisode.overview || show.description,
      poster: selectedEpisode.thumbnail || show.poster,
    } satisfies MediaItem;
  }, [seasonNumber, episodeNumber, prefetchedVideos, show]);

  if (!episodeMedia) {
    return null;
  }

  return (
    <div className="mt-6 w-full">
      <MediaActions media={episodeMedia} />
    </div>
  );
}
