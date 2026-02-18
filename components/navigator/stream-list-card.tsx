"use client";

import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Radio, Check } from "lucide-react";
import { StreamCard } from "./stream-card";

interface StreamListCardProps {
  result: {
    success: boolean;
    mediaId?: string;
    mediaType?: string;
    selectionId?: string;
    streamCount?: number;
    addonCount?: number;
    streams?: Array<{
      choice?: number;
      streamId?: string | null;
      addonName?: string | null;
      title?: string | null;
      name?: string | null;
      resolution?: string | null;
      tags?: string[];
      playable?: boolean;
      filename?: string | null;
      videoSize?: number | null;
      score?: number;
    }>;
    bestStream?: {
      choice?: number;
      streamId?: string | null;
      addonName?: string | null;
      title?: string | null;
      name?: string | null;
      resolution?: string | null;
      tags?: string[];
      playable?: boolean;
      filename?: string | null;
      videoSize?: number | null;
    } | null;
    message?: string;
    error?: string;
  };
  className?: string;
  index?: number;
}

export const StreamListCard: React.FC<StreamListCardProps> = ({
  result,
  className,
  index = 0,
}) => {
  if (!result.success || !result.streams || result.streams.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, delay: index * 0.1, ease: "easeOut" }}
      >
        <div
          className={cn(
            "transition duration-200 bg-card backdrop-blur-sm p-3 rounded-xl w-full",
            className
          )}
        >
          <div className="flex gap-3 items-center w-full">
            <div className="w-9 h-9 bg-muted rounded-lg flex items-center justify-center flex-shrink-0">
              <Radio className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-sm">No streams found</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {result.error || result.message || "No playable streams available"}
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  // Show up to 20 streams
  const displayStreams = result.streams.slice(0, 20);
  const bestStreamId = result.bestStream?.streamId ?? null;
  const bestStreamChoice = result.bestStream?.choice ?? null;
  const bestStreamTitle =
    result.bestStream?.title ||
    result.bestStream?.name ||
    result.bestStream?.filename ||
    null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, delay: index * 0.1, ease: "easeOut" }}
    >
      <div
        className={cn(
          "transition duration-200 bg-card backdrop-blur-sm p-3 rounded-xl w-full space-y-2",
          className
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-muted rounded-md flex items-center justify-center flex-shrink-0">
              <Radio className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <h3 className="font-medium text-sm">Streams</h3>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-auto">
              {result.streamCount} found
            </Badge>
            {result.addonCount && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-auto">
                {result.addonCount} addon{result.addonCount !== 1 ? "s" : ""}
              </Badge>
            )}
          </div>
        </div>

        {/* Stream list */}
        <div className="space-y-1">
          {displayStreams.map((stream, i) => {
            const streamKey = `${stream.addonName}-${stream.title || stream.name}-${i}`;
            const isBest = bestStreamId
              ? stream.streamId === bestStreamId
              : bestStreamChoice != null
                ? stream.choice === bestStreamChoice
                : bestStreamTitle != null &&
                  (stream.title === bestStreamTitle ||
                    stream.name === bestStreamTitle ||
                    stream.filename === bestStreamTitle);

            return (
              <StreamCard
                key={streamKey}
                stream={stream}
                isBest={isBest}
                index={i}
              />
            );
          })}
        </div>

        {result.streams.length > 20 && (
          <p className="text-[10px] text-muted-foreground text-center">
            +{result.streams.length - 20} more streams
          </p>
        )}
      </div>
    </motion.div>
  );
};
