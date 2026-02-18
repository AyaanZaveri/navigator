"use client";

import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Radio, Check } from "lucide-react";

interface StreamCardProps {
  stream: {
    addonName?: string | null;
    title?: string | null;
    name?: string | null;
    resolution?: string | null;
    tags?: string[];
    playable?: boolean;
    filename?: string | null;
    videoSize?: number | null;
  };
  isBest?: boolean;
  className?: string;
  index?: number;
}

export const StreamCard: React.FC<StreamCardProps> = ({
  stream,
  isBest = false,
  className,
  index = 0,
}) => {
  const displayTitle =
    stream.title || stream.name || stream.filename || "Unknown stream";

  // Truncate long titles to 80 chars
  const truncatedTitle =
    displayTitle.length > 80
      ? `${displayTitle.substring(0, 80)}...`
      : displayTitle;

  const formatVideoSize = (bytes?: number | null) => {
    if (!bytes) return null;
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(1)} GB`;
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(0)} MB`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{
        duration: 0.3,
        delay: index * 0.06,
        ease: "easeOut",
      }}
    >
      <div
        className={cn(
          "group transition duration-200 bg-card backdrop-blur-sm p-3 rounded-xl w-full",
          isBest && "ring-2 ring-primary/30",
          className
        )}
      >
        <div className="flex gap-3 items-center w-full">
          {/* Icon */}
          <div
            className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
              isBest ? "bg-primary/10" : "bg-muted"
            )}
          >
            {isBest ? (
              <Check className="h-4 w-4 text-primary" />
            ) : (
              <Radio className="h-4 w-4 text-muted-foreground" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-xs leading-snug line-clamp-2">
              {truncatedTitle}
            </h3>

            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {stream.resolution && (
                <Badge
                  variant="secondary"
                  className="h-auto px-2 py-0.5 font-mono text-[10px]"
                >
                  {stream.resolution}
                </Badge>
              )}
              {stream.tags?.map((tag) => (
                <Badge
                  key={tag}
                  variant="outline"
                  className="h-auto px-1.5 py-0.5 text-[10px]"
                >
                  {tag}
                </Badge>
              ))}
              {stream.videoSize && (
                <Badge
                  variant="outline"
                  className="h-auto px-2 py-0.5 font-mono text-[10px]"
                >
                  {formatVideoSize(stream.videoSize)}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
