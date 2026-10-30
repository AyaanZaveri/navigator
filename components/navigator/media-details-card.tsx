"use client";

import { Film, Tv, Star } from "lucide-react";
import { RottenTomatoesIcon } from "../icons/rotten-tomatoes";
import { toEpisodeNavigationPath } from "@/lib/series-route";
import { ResultCard, ResultBadge, formatCardRuntime } from "./result-card";

interface MediaDetailsCardProps {
  media: {
    id: string;
    name: string;
    type: "Movie" | "Series" | "Episode";
    year?: number;
    overview?: string;
    rating?: string;
    runtime?: number;
    genres?: string[];
    cast?: string[];
    communityRating?: number;
    criticRating?: number;
  };
  className?: string;
  index?: number;
  onClick?: () => void;
}

export function MediaDetailsCard({
  media,
  className,
  index = 0,
  onClick,
}: MediaDetailsCardProps) {
  const href =
    media.type === "Movie"
      ? `/movie/${media.id}`
      : media.type === "Episode"
        ? toEpisodeNavigationPath(media.id)
        : `/series/${media.id}`;
  return (
    <ResultCard
      className={className}
      index={index}
      title={media.name}
      icon={media.type === "Movie" ? Film : Tv}
      href={onClick ? undefined : href}
      onClick={onClick}
      metadata={
        <>
          <ResultBadge>{media.type}</ResultBadge>
          {media.year && <ResultBadge>{media.year}</ResultBadge>}
          {media.communityRating != null && (
            <ResultBadge>
              <Star className="fill-yellow-400 text-yellow-400" />
              {media.communityRating.toFixed(1)}
            </ResultBadge>
          )}
          {media.criticRating != null && (
            <ResultBadge>
              <RottenTomatoesIcon size={12} />
              {media.criticRating}%
            </ResultBadge>
          )}
          {media.rating && <ResultBadge>{media.rating}</ResultBadge>}
          {media.runtime ? (
            <ResultBadge>{formatCardRuntime(media.runtime)}</ResultBadge>
          ) : null}
          {media.genres?.slice(0, 3).map((genre) => (
            <ResultBadge key={genre}>{genre}</ResultBadge>
          ))}
        </>
      }
      description={
        <>
          {media.cast && media.cast.length > 0 && (
            <span className="block">
              {media.cast.slice(0, 3).join(", ")}
              {media.cast.length > 3 && ` +${media.cast.length - 3} more`}
            </span>
          )}
          {media.overview && (
            <span className="line-clamp-2">{media.overview}</span>
          )}
        </>
      }
    />
  );
}
