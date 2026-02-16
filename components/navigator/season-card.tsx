"use client";

import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Calendar, PlayCircle, Info, Hash } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useRouter } from "next/navigation";
import { useAtom } from "jotai";
import { isAIAskOpenAtom } from "@/lib/atoms";
import { buildEpisodePath } from "@/lib/series-route";

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

export const SeasonCard: React.FC<SeasonCardProps> = ({
  season,
  seriesId,
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
      const parsedSeasonId = season.id.match(/^(.*):(\d+)$/);
      const targetSeriesId =
        seriesId || parsedSeasonId?.[1] || season.id;
      const targetSeasonNumber =
        season.seasonNumber ??
        (() => {
          const parsed = Number(parsedSeasonId?.[2] ?? "");
          return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
        })();
      router.push(buildEpisodePath(targetSeriesId, targetSeasonNumber, 1));
    }
    
    // Close the AIAsk component when clicked
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
      <div
        className={cn(
          "group cursor-pointer transition duration-200 bg-card backdrop-blur-sm p-3 rounded-xl hover:bg-card/50 w-full active:scale-[0.99]",
          className
        )}
        onClick={handleClick}
      >
        <div className="flex gap-3 items-start w-full">
          {/* Season icon */}
          <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center flex-shrink-0">
            <Calendar className="h-5 w-5 text-muted-foreground" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h3 className="font-medium text-sm leading-tight group-hover:text-primary transition-colors">
                  {season.name}
                </h3>
                
                {/* Season metadata */}
                <div className="flex items-center gap-2 mt-1">
                  {season.seasonNumber && (
                    <Badge variant="secondary" className="text-xs px-1.5 py-0">
                      <Hash className="h-3 w-3 mr-1" />
                      Season {season.seasonNumber}
                    </Badge>
                  )}
                  {season.episodeCount && (
                    <Badge variant="outline" className="text-xs px-1.5 py-0">
                      <PlayCircle className="h-3 w-3 mr-1" />
                      {season.episodeCount} episode{season.episodeCount !== 1 ? 's' : ''}
                    </Badge>
                  )}
                </div>

                {/* Year */}
                {season.year && (
                  <div className="flex items-center gap-1 mt-1.5 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    <span>{season.year}</span>
                  </div>
                )}

                {/* Overview preview */}
                {season.overview && (
                  <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
                    {season.overview.length > 100 
                      ? `${season.overview.substring(0, 100)}...` 
                      : season.overview
                    }
                  </p>
                )}
              </div>
              
              <Info className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
