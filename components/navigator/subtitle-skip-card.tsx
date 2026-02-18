"use client";

import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Subtitles, Clock, MessageSquareQuote } from "lucide-react";

interface SubtitleSkipCardProps {
  result: {
    success: boolean;
    action?: string;
    timestamp?: number;
    timestampFormatted?: string;
    text?: string;
    message?: string;
    error?: string;
  };
  className?: string;
  index?: number;
}

export const SubtitleSkipCard: React.FC<SubtitleSkipCardProps> = ({
  result,
  className,
  index = 0,
}) => {
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
        <div className="flex gap-3 items-start w-full">
          {/* Icon */}
          <div
            className={cn(
              "w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0",
              result.success ? "bg-primary/10" : "bg-muted"
            )}
          >
            <Subtitles
              className={cn(
                "h-4 w-4",
                result.success ? "text-primary" : "text-muted-foreground"
              )}
            />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-sm leading-snug">
                {result.success ? "Skipping to scene" : "Subtitle search failed"}
              </h3>
              {result.timestampFormatted && (
                <Badge variant="secondary" className="text-xs px-1.5 py-0 h-auto">
                  <Clock className="h-3 w-3" />
                  {result.timestampFormatted}
                </Badge>
              )}
            </div>

            {result.text && (
              <div className="flex items-start gap-1.5 mt-1.5">
                <MessageSquareQuote className="h-3 w-3 text-muted-foreground mt-0.5 flex-shrink-0" />
                <p className="text-xs text-muted-foreground italic line-clamp-2">
                  "{result.text}"
                </p>
              </div>
            )}

            {!result.success && result.error && (
              <p className="text-xs text-destructive mt-1">{result.error}</p>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};
