"use client";

import { Layers } from "lucide-react";
import { navigatorTitlePath } from "@/lib/navigator-title-path";
import { ResultCard, ResultMeta } from "./result-card";

interface SeasonCardProps {
  season: {
    id: string;
    name: string;
    seasonNumber?: number;
    episodeCount?: number;
    overview?: string;
    poster?: string;
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
      image={season.poster}
      href={onClick ? undefined : navigatorTitlePath(targetSeries, "episode", number, 1)}
      onClick={onClick}
      metadata={
        <>
          {season.name !== `Season ${number}` && <ResultMeta>Season {number}</ResultMeta>}
          {season.episodeCount != null && (
            <ResultMeta>{season.episodeCount} {season.episodeCount === 1 ? "episode" : "episodes"}</ResultMeta>
          )}
          {season.year && <ResultMeta>{season.year}</ResultMeta>}
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
