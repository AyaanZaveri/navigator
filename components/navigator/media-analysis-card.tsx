"use client";

import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ScanText, HelpCircle } from "lucide-react";

interface MediaAnalysisCardProps {
  result: {
    success: boolean;
    answer?: string;
    question?: string;
    mediaName?: string;
    subtitleCount?: number;
    analyzedSubtitleCount?: number;
    error?: string;
  };
  className?: string;
  index?: number;
}

export const MediaAnalysisCard: React.FC<MediaAnalysisCardProps> = ({
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
          <div className="w-9 h-9 bg-muted rounded-lg flex items-center justify-center flex-shrink-0">
            <ScanText className="h-4 w-4 text-muted-foreground" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-sm leading-snug">
                Media Analysis
              </h3>
              {result.mediaName && (
                <span className="text-xs text-muted-foreground truncate">
                  {result.mediaName}
                </span>
              )}
            </div>

            {result.question && (
              <div className="flex items-start gap-1.5">
                <HelpCircle className="h-3 w-3 text-muted-foreground mt-0.5 flex-shrink-0" />
                <p className="text-xs text-muted-foreground line-clamp-1">
                  {result.question}
                </p>
              </div>
            )}

            {result.analyzedSubtitleCount != null && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-auto">
                {result.analyzedSubtitleCount} subtitles analyzed
              </Badge>
            )}

            {!result.success && result.error && (
              <p className="text-xs text-destructive">{result.error}</p>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};
