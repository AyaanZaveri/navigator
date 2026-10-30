"use client";

import { Film, Tv } from "lucide-react";
import { ResultCard, ResultBadge } from "./result-card";

interface NavigationCardProps {
  result: {
    success: boolean;
    action?: string;
    url?: string;
    mediaName?: string;
    mediaType?: string;
    seasonNumber?: number;
    episodeNumber?: number;
    poster?: string | null;
    thumbnail?: string | null;
    background?: string | null;
    message?: string;
    error?: string;
  };
  className?: string;
  index?: number;
}

export function NavigationCard({
  result,
  className,
  index = 0,
}: NavigationCardProps) {
  const episode = result.mediaType?.toLowerCase() === "episode";
  return (
    <ResultCard
      className={className}
      index={index}
      title={
        result.success
          ? result.mediaName || "Opening title…"
          : "Navigation failed"
      }
      icon={result.mediaType?.toLowerCase() === "movie" ? Film : Tv}
      image={episode ? result.thumbnail : result.poster}
      href={
        result.success &&
        result.url?.startsWith("/") &&
        !result.url.startsWith("//")
          ? result.url
          : undefined
      }
      metadata={
        <>
          {result.mediaType && <ResultBadge>{result.mediaType}</ResultBadge>}
          {result.seasonNumber != null && result.episodeNumber != null && (
            <ResultBadge>
              S{result.seasonNumber} · E{result.episodeNumber}
            </ResultBadge>
          )}
        </>
      }
      error={!result.success ? result.error : undefined}
    />
  );
}
