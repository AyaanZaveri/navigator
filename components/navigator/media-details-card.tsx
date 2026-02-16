"use client";

import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Film, Tv, Star, Clock, Calendar, Info, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useRouter } from "next/navigation";
import { useAtom } from "jotai";
import { isAIAskOpenAtom } from "@/lib/atoms";
import { RottenTomatoesIcon } from "../icons/rotten-tomatoes";
import { toEpisodeNavigationPath } from "@/lib/series-route";

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

export const MediaDetailsCard: React.FC<MediaDetailsCardProps> = ({
  media,
  className,
  index = 0,
  onClick,
}) => {
  const router = useRouter();
  const [isAIAskOpen, setIsAIAskOpen] = useAtom(isAIAskOpenAtom);

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      if (media.type === "Movie") {
        router.push(`/movie/${media.id}`);
      } else if (media.type === "Episode") {
        router.push(toEpisodeNavigationPath(media.id));
      } else {
        router.push(`/series/${media.id}`);
      }
    }
    
    // Close the AIAsk component when clicked
    if (isAIAskOpen) {
      setIsAIAskOpen(false);
    }
  };

  const formatRuntime = (runtime?: number) => {
    if (!runtime) return null;
    const hours = Math.floor(runtime / 60);
    const minutes = runtime % 60;
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const getTypeIcon = () => {
    switch (media.type) {
      case "Movie":
        return Film;
      case "Series":
        return Tv;
      case "Episode":
        return Tv;
      default:
        return Film;
    }
  };

  const TypeIcon = getTypeIcon();

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
          "group cursor-pointer transition duration-200 bg-card backdrop-blur-sm p-4 rounded-xl hover:bg-card/50 w-full active:scale-[0.99]",
          className
        )}
        onClick={handleClick}
      >
        <div className="flex gap-4 items-start w-full">
          {/* Media icon */}
          <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center flex-shrink-0">
            <TypeIcon className="h-6 w-6 text-muted-foreground" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h3 className="font-medium text-base leading-tight group-hover:text-primary transition-colors">
                  {media.name}
                </h3>
                
                {/* Type and year */}
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="secondary" className="text-xs px-2 py-0.5">
                    {media.type}
                  </Badge>
                  {media.year && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      <span>{media.year}</span>
                    </div>
                  )}
                </div>
              </div>
              
              <Info className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>

            {/* Ratings and runtime */}
            <div className="flex items-center gap-3 flex-wrap">
              {media.communityRating && (
                <div className="flex items-center gap-1 text-xs">
                  <Star className="h-3 w-3 text-yellow-500 fill-current" />
                  <span className="font-medium">{media.communityRating.toFixed(1)}</span>
                </div>
              )}
              {media.criticRating && (
                <div className="flex items-center gap-1 text-xs">
                  <RottenTomatoesIcon className="h-3 w-3" />
                  <span className="font-medium">{media.criticRating}%</span>
                </div>
              )}
              {media.rating && (
                <Badge variant="outline" className="text-xs px-1.5 py-0">
                  {media.rating}
                </Badge>
              )}
              {media.runtime && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>{formatRuntime(media.runtime)}</span>
                </div>
              )}
            </div>

            {/* Genres */}
            {media.genres && media.genres.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap">
                {media.genres.slice(0, 3).map((genre, idx) => (
                  <Badge key={idx} variant="outline" className="text-xs px-1.5 py-0">
                    {genre}
                  </Badge>
                ))}
                {media.genres.length > 3 && (
                  <span className="text-xs text-muted-foreground">
                    +{media.genres.length - 3} more
                  </span>
                )}
              </div>
            )}

            {/* Cast */}
            {media.cast && media.cast.length > 0 && (
              <div className="flex items-center gap-2">
                <Users className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  {media.cast.slice(0, 3).join(", ")}
                  {media.cast.length > 3 && ` +${media.cast.length - 3} more`}
                </span>
              </div>
            )}

            {/* Overview preview */}
            {media.overview && (
              <p className="text-xs text-muted-foreground line-clamp-2">
                {media.overview.length > 150 
                  ? `${media.overview.substring(0, 150)}...` 
                  : media.overview
                }
              </p>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};
