"use client";

import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Film, Tv } from "lucide-react";

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

export const NavigationCard: React.FC<NavigationCardProps> = ({
  result,
  className,
  index = 0,
}) => {
  const TypeIcon =
    result.mediaType?.toLowerCase() === "movie" ? Film : Tv;
  const mediaType = result.mediaType?.toLowerCase();
  const isSeries = mediaType === "series";
  const isEpisode = mediaType === "episode";
  const previewImage = isEpisode
    ? result.thumbnail || null
    : result.poster || null;

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
      <div
        className={cn(
          "group transition duration-200 bg-card backdrop-blur-sm p-3 rounded-xl w-full",
          result.success ? "" : "ring-2 ring-destructive/20",
          className
        )}
      >
        <div className="flex gap-3 items-center w-full">
          {/* Media preview */}
          <div
            className={cn(
              "rounded-md overflow-hidden flex-shrink-0",
              isEpisode ? "w-16 aspect-video" : "w-10 h-14",
              previewImage
                ? "bg-muted/30"
                : result.success
                  ? "bg-muted/40"
                  : "bg-destructive/10"
            )}
          >
            {previewImage ? (
              <img
                src={previewImage}
                alt={result.mediaName || "Media preview"}
                className="w-full h-full object-cover"
              />
            ) : (
              <span
                className={cn(
                  "text-xs font-medium",
                  result.success ? "text-muted-foreground" : "text-destructive"
                )}
              >
                {(result.mediaName || "M").charAt(0)}
              </span>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-sm leading-snug line-clamp-1">
                {result.success
                  ? result.mediaName || "Navigating..."
                  : "Navigation failed"}
              </h3>
            </div>

            <div className="flex items-center gap-1.5 mt-1">
              {result.mediaType && (
                <Badge
                  variant="secondary"
                  className="text-xs px-2 py-0.5 h-auto inline-flex items-center gap-1.5"
                >
                  <TypeIcon
                    className={cn("h-3 w-3", isSeries && "-translate-y-px")}
                  />
                  {result.mediaType}
                </Badge>
              )}
              {result.seasonNumber && result.episodeNumber && (
                <Badge variant="outline" className="text-xs px-2 py-0.5 h-auto">
                  S{result.seasonNumber} E{result.episodeNumber}
                </Badge>
              )}
              {!result.success && result.error && (
                <span className="text-xs text-destructive truncate">
                  {result.error}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
