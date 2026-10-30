"use client";

import { Layers } from "lucide-react";
import { buildEpisodePath } from "@/lib/series-route";
import { ResultCard, ResultBadge } from "./result-card";

interface SeasonCardProps {
  season: {
    id: string;
    name: string;
    seasonNumber?: number;
    episodeCount?: number;
    overview?: string;
    year?: number;
  };
  seriesId?: string;
  className?: string;
  index?: number;
  onClick?: () => void;
}

export function SeasonCard({
  season,
  seriesId,
  className,
  index = 0,
  onClick,
}: SeasonCardProps) {
  const parsed = season.id.match(/^(.*):(\d+)$/);
  const targetSeries = seriesId || parsed?.[1] || season.id;
  const parsedNumber = Number(parsed?.[2]);
  const number =
    season.seasonNumber ??
    (Number.isInteger(parsedNumber) && parsedNumber > 0 ? parsedNumber : 1);
  return (
    <ResultCard
      className={className}
      index={index}
      title={season.name}
      icon={Layers}
      href={onClick ? undefined : buildEpisodePath(targetSeries, number, 1)}
      onClick={onClick}
      metadata={
        <>
          <ResultBadge>Season {number}</ResultBadge>
          {season.episodeCount != null && (
            <ResultBadge>{season.episodeCount} episodes</ResultBadge>
          )}
          {season.year && <ResultBadge>{season.year}</ResultBadge>}
        </>
      }
      description={
        season.overview && (
          <span className="line-clamp-2">{season.overview}</span>
        )
      }
    />
  );
}
