"use client";

import { Film, Tv, Star } from "lucide-react";
import { RottenTomatoesIcon } from "../icons/rotten-tomatoes";
import { buildEpisodePath, toEpisodeNavigationPath } from "@/lib/series-route";
import { ResultCard, ResultBadge, formatCardRuntime } from "./result-card";

interface MediaLinkCardProps {
  item: {
    id: string;
    name?: string;
    title?: string;
    seriesId?: string;
    seriesName?: string;
    seasonNumber?: number;
    episodeNumber?: number;
    type?: "Movie" | "Series" | "Episode" | "movie" | "series" | "episode";
    year?: number;
    communityRating?: number;
    criticRating?: number;
    officialRating?: string;
    runtime?: number;
    overview?: string;
    rating?: number;
    poster?: string;
    thumbnail?: string;
    background?: string;
    releaseInfo?: string | null;
    addonName?: string | null;
    catalogName?: string | null;
  };
  className?: string;
  index?: number;
}

export function MediaLinkCard({
  item,
  className,
  index = 0,
}: MediaLinkCardProps) {
  const title = item.name || item.title || "Untitled";
  const type =
    item.type?.toLowerCase() ||
    (item.episodeNumber != null ? "episode" : "unknown");
  const episode = type === "episode";
  const href =
    type === "movie"
      ? `/movie/${item.id}`
      : type === "series"
        ? `/series/${item.id}`
        : episode
          ? item.seriesId &&
            item.seasonNumber != null &&
            item.episodeNumber != null
            ? buildEpisodePath(
                item.seriesId,
                item.seasonNumber,
                item.episodeNumber,
              )
            : toEpisodeNavigationPath(item.id)
          : undefined;
  const release =
    item.releaseInfo && (episode || !item.year) ? item.releaseInfo : item.year;
  return (
    <ResultCard
      className={className}
      index={index}
      title={
        <>
          {title}
          {episode && item.seriesName && (
            <span className="font-normal text-muted-foreground">
              {" "}
              · {item.seriesName}
            </span>
          )}
        </>
      }
      icon={type === "movie" ? Film : Tv}
      image={
        episode
          ? item.thumbnail || item.poster || item.background
          : item.poster || item.background || item.thumbnail
      }
      href={href}
      metadata={
        <>
          <ResultBadge>
            {type === "movie"
              ? "Movie"
              : episode
                ? "Episode"
                : type === "series"
                  ? "Series"
                  : "Media"}
          </ResultBadge>
          {episode &&
            item.seasonNumber != null &&
            item.episodeNumber != null && (
              <ResultBadge>
                S{item.seasonNumber} · E{item.episodeNumber}
              </ResultBadge>
            )}
          {release && <ResultBadge>{release}</ResultBadge>}
          {item.criticRating != null && (
            <ResultBadge>
              <RottenTomatoesIcon size={12} />
              {item.criticRating}%
            </ResultBadge>
          )}
          {item.communityRating != null && (
            <ResultBadge>
              <Star className="fill-yellow-400 text-yellow-400" />
              {item.communityRating.toFixed(1)}
            </ResultBadge>
          )}
          {item.officialRating && (
            <ResultBadge>{item.officialRating}</ResultBadge>
          )}
          {item.runtime ? (
            <ResultBadge>{formatCardRuntime(item.runtime)}</ResultBadge>
          ) : null}
        </>
      }
    />
  );
}
