"use client";

import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Play, Film, Tv } from "lucide-react";

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

export const PlayMediaCard: React.FC<PlayMediaCardProps> = ({
  result,
  className,
  index = 0,
}) => {
  const isEpisode = result.mediaType === "Episode";
  const TypeIcon = result.mediaType === "Movie" ? Film : Tv;
  const displayTitle = isEpisode
    ? result.episodeTitle || result.mediaName || "Episode"
    : result.mediaName || "Media";

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
          className
        )}
      >
        <div className="flex gap-3 items-center w-full">
          {/* Play icon */}
          <div className="w-9 h-9 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
            <Play className="h-4 w-4 text-primary fill-primary" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-sm leading-snug line-clamp-1">
              {displayTitle}
            </h3>

            <div className="flex items-center gap-1.5 mt-1">
              <Badge variant="secondary" className="text-xs px-1.5 py-0 h-auto">
                <TypeIcon className="h-3 w-3" />
                {result.mediaType || "Media"}
              </Badge>
              {isEpisode && result.seasonNumber && result.episodeNumber && (
                <Badge variant="outline" className="text-xs px-1.5 py-0 h-auto">
                  S{result.seasonNumber} E{result.episodeNumber}
                </Badge>
              )}
              {isEpisode && result.showName && (
                <span className="text-xs text-muted-foreground truncate">
                  {result.showName}
                </span>
              )}
              {result.streamUrl && (
                <Badge variant="outline" className="text-xs px-1 py-0 h-auto">
                  Stream ready
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
