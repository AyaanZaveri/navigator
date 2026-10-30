"use client";

import { artworkFromPath } from "@/lib/artwork";

import { Tv } from "lucide-react";
import { buildEpisodePath, toEpisodeNavigationPath } from "@/lib/series-route";
import { ResultCard, ResultBadge, formatCardRuntime } from "./result-card";

interface EpisodeCardProps {
  episode: {
    id: string;
    name: string;
    episodeNumber?: number;
    seasonNumber?: number;
    overview?: string;
    runtime?: number;
    seriesId?: string;
    thumbnail?: string;
  };
  className?: string;
  index?: number;
  onClick?: () => void;
}

export function EpisodeCard({
  episode,
  className,
  index = 0,
  onClick,
}: EpisodeCardProps) {
  const href =
    episode.seriesId &&
    episode.seasonNumber != null &&
    episode.episodeNumber != null
      ? buildEpisodePath(
          episode.seriesId,
          episode.seasonNumber,
          episode.episodeNumber,
        )
      : toEpisodeNavigationPath(episode.id);
  return (
    <ResultCard
      className={className}
      index={index}
      title={episode.name}
      icon={Tv}
      image={artworkFromPath(href)}
      href={onClick ? undefined : href}
      onClick={onClick}
      metadata={
        <>
          <ResultBadge>Episode</ResultBadge>
          {episode.seasonNumber != null && episode.episodeNumber != null && (
            <ResultBadge>
              S{episode.seasonNumber} · E{episode.episodeNumber}
            </ResultBadge>
          )}
          {episode.runtime ? (
            <ResultBadge>{formatCardRuntime(episode.runtime)}</ResultBadge>
          ) : null}
        </>
      }
      description={
        episode.overview && (
          <span className="line-clamp-2">{episode.overview}</span>
        )
      }
    />
  );
}
