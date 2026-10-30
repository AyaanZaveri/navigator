"use client";

import { Play } from "lucide-react";
import { ResultCard, ResultBadge } from "./result-card";

interface PlayMediaCardProps {
  result: {
    success: boolean;
    action?: string;
    mediaId?: string;
    mediaName?: string;
    mediaType?: "Movie" | "Series" | "Episode";
    streamUrl?: string;
    showName?: string;
    episodeTitle?: string;
    seasonNumber?: number;
    episodeNumber?: number;
    message?: string;
  };
  className?: string;
  index?: number;
}

export function PlayMediaCard({
  result,
  className,
  index = 0,
}: PlayMediaCardProps) {
  const episode = result.mediaType === "Episode";
  const title = episode
    ? result.episodeTitle || result.mediaName || "Episode"
    : result.mediaName || "Media";
  return (
    <ResultCard
      className={className}
      index={index}
      title={title}
      icon={Play}
      metadata={
        <>
          <ResultBadge>{result.mediaType || "Media"}</ResultBadge>
          {episode &&
            result.seasonNumber != null &&
            result.episodeNumber != null && (
              <ResultBadge>
                S{result.seasonNumber} · E{result.episodeNumber}
              </ResultBadge>
            )}
          {result.streamUrl && <ResultBadge>Stream ready</ResultBadge>}
        </>
      }
      description={episode ? result.showName : undefined}
    />
  );
}
