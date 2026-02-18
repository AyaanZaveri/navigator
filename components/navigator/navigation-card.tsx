"use client";

import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Navigation, Film, Tv, ArrowRight } from "lucide-react";

interface NavigationCardProps {
  result: {
    success: boolean;
    action?: string;
    url?: string;
    mediaName?: string;
    mediaType?: string;
    seasonNumber?: number;
    episodeNumber?: number;
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
          {/* Icon */}
          <div
            className={cn(
              "w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0",
              result.success ? "bg-primary/10" : "bg-destructive/10"
            )}
          >
            <Navigation
              className={cn(
                "h-4 w-4",
                result.success ? "text-primary" : "text-destructive"
              )}
            />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-sm leading-snug line-clamp-1">
                {result.success
                  ? result.mediaName || "Navigating..."
                  : "Navigation failed"}
              </h3>
              <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
            </div>

            <div className="flex items-center gap-1.5 mt-1">
              {result.mediaType && (
                <Badge variant="secondary" className="text-xs px-1.5 py-0 h-auto">
                  <TypeIcon className="h-3 w-3" />
                  {result.mediaType}
                </Badge>
              )}
              {result.seasonNumber && result.episodeNumber && (
                <Badge variant="outline" className="text-xs px-1.5 py-0 h-auto">
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
