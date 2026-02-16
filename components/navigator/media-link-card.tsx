"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Star, Film, Tv } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useAtom } from "jotai";
import { isAIAskOpenAtom } from "@/lib/atoms";
import { motion } from "framer-motion";
import { RottenTomatoesIcon } from "../icons/rotten-tomatoes";
import { buildEpisodePath, toEpisodeNavigationPath } from "@/lib/series-route";

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

export const MediaLinkCard: React.FC<MediaLinkCardProps> = ({
  item,
  className,
  index = 0,
}) => {
  const {
    id: mediaId,
    name,
    title: fallbackTitle,
    seriesName,
    year,
    communityRating,
    criticRating,
    officialRating,
    runtime,
    releaseInfo,
  } = item;

  const title = name || fallbackTitle || "Untitled";

  const getTypeAndHref = () => {
    const t =
      typeof item.type === "string"
        ? item.type.toLowerCase()
        : item.seasonNumber && item.episodeNumber
          ? "episode"
          : "unknown";

    switch (t) {
      case "movie":
        return { type: "movie", href: `/movie/${mediaId}` };
      case "series":
        return { type: "series", href: `/series/${mediaId}` };
      case "episode":
        if (item.seriesId && item.seasonNumber && item.episodeNumber) {
          return {
            type: "episode",
            href: buildEpisodePath(
              item.seriesId,
              item.seasonNumber,
              item.episodeNumber
            ),
          };
        }
        return { type: "episode", href: toEpisodeNavigationPath(mediaId) };
      default:
        return { type: "unknown", href: `#` };
    }
  };

  const { type, href } = getTypeAndHref();
  const showReleaseInfoBadge = Boolean(
    releaseInfo && (type === "episode" || !year)
  );
  const showYearBadge = Boolean(year && !(type === "episode" && releaseInfo));
  const imageUrl =
    type === "episode"
      ? item.thumbnail || item.poster || item.background
      : item.poster || item.background || item.thumbnail;

  const [imageLoading, setImageLoading] = React.useState(true);
  const [isAIAskOpen, setIsAIAskOpen] = useAtom(isAIAskOpenAtom);

  const handleClick = () => {
    if (isAIAskOpen) {
      setIsAIAskOpen(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{
        duration: 0.3,
        delay: index * 0.1,
        ease: "easeOut",
      }}
    >
      <Link
        className={cn(
          "group cursor-pointer transition duration-200 bg-card backdrop-blur-sm p-3 rounded-xl hover:bg-card/50 w-full block active:scale-[0.99] relative overflow-hidden",
          className
        )}
        draggable={false}
        href={href}
        onClick={handleClick}
      >
        <div className="flex gap-3 items-center w-full">
          {/* Poster/Thumbnail */}
          <div
            className={cn(
              "relative rounded-sm overflow-hidden bg-muted/30 flex-shrink-0",
              type === "episode" ? "w-16 aspect-video" : "w-10 h-14"
            )}
          >
            {imageLoading && (
              <Skeleton className="absolute inset-0 w-full h-full" />
            )}
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={type === "episode" && seriesName ? seriesName : title}
                className={cn(
                  "object-cover transition-transform duration-200 w-full h-full",
                  imageLoading ? "opacity-0" : "opacity-100"
                )}
                sizes="40px"
                onLoad={() => setImageLoading(false)}
                onError={() => setImageLoading(false)}
              />
            ) : (
              <div className="w-full h-full bg-muted flex items-center justify-center text-xs text-muted-foreground">
                {title.charAt(0)}
              </div>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 flex flex-col justify-center">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h3 className="font-medium text-sm leading-snug line-clamp-1">
                  {type === "episode" && seriesName ? (
                    <>
                      {title}{" "}
                      <span className="text-muted-foreground font-normal">
                        · {seriesName}
                      </span>
                    </>
                  ) : (
                    title
                  )}
                </h3>
              </div>

              {type === "episode" && item.seasonNumber && item.episodeNumber ? (
                <Badge
                  variant="secondary"
                  className="text-xs px-1.5 py-0.5 h-auto flex-shrink-0"
                >
                  <Tv className="h-3 w-3" />
                  S{item.seasonNumber} • E{item.episodeNumber}
                </Badge>
              ) : (
                <Badge
                  variant="secondary"
                  className="text-xs px-1.5 py-0.5 h-auto flex-shrink-0"
                >
                  {type === "movie" ? (
                    <>
                      <Film className="h-3 w-3" />
                      Movie
                    </>
                  ) : (
                    <>
                      <Tv className="h-3 w-3" />
                      Series
                    </>
                  )}
                </Badge>
              )}
            </div>

            <div className="mt-1 flex items-center gap-1 not-odd:text-xs">
              {showReleaseInfoBadge && (
                <Badge variant="outline" className="px-1.5 py-0.5 h-auto">
                  {releaseInfo}
                </Badge>
              )}
              {showYearBadge && (
                <Badge variant="outline" className="px-1.5 py-0.5 h-auto">
                  {year}
                </Badge>
              )}

              {/* CriticRating */}
              {criticRating && (
                <Badge variant="outline" className="px-1.5 py-0.5 h-auto">
                  <RottenTomatoesIcon size={12} />
                  {criticRating}%
                </Badge>
              )}

              {/* CommunityRating */}
              {communityRating && (
                <Badge variant="outline" className="px-1.5 py-0.5 h-auto">
                  <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                  {communityRating.toFixed(1)}
                </Badge>
              )}

              {/* OfficialRating */}
              {officialRating && (
                <Badge variant="outline" className="px-1.5 py-0.5 h-auto">
                  {officialRating}
                </Badge>
              )}

              {/* Runtime */}
              {runtime ? (
                <Badge variant="outline" className="px-1.5 py-0.5 h-auto">
                  {Math.floor(runtime / 60) > 0
                    ? `${Math.floor(runtime / 60)}h `
                    : ""}
                  {runtime % 60}m
                </Badge>
              ) : null}
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
};
