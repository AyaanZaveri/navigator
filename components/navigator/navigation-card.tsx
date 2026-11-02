"use client";

import { artworkFromPath } from "@/lib/artwork";

import { Film, Tv } from "lucide-react";
import { ResultCard, ResultMeta } from "./result-card";

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
  const episode = result.mediaType?.toLowerCase() === "episode" ||
    result.episodeNumber != null ||
    /(?:\/\d+\/\d+(?:[?#]|$)|[?&]episode=\d+)/.test(result.url || "");
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
      image={(episode ? result.thumbnail : result.poster) || artworkFromPath(result.url)}
      imageAspect={episode ? "landscape" : "portrait"}
      href={
        result.success &&
        result.url?.startsWith("/") &&
        !result.url.startsWith("//")
          ? result.url
          : undefined
      }
      metadata={
        <>
          {result.mediaType && <ResultMeta>{result.mediaType}</ResultMeta>}
          {result.seasonNumber != null && result.episodeNumber != null && (
            <ResultMeta>
              S{result.seasonNumber} · E{result.episodeNumber}
            </ResultMeta>
          )}
        </>
      }
      error={!result.success ? result.error : undefined}
    />
  );
}
