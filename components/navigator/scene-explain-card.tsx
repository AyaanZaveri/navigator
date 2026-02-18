"use client";

import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Clock, MessageSquareQuote } from "lucide-react";

interface SceneExplainCardProps {
  result: {
    success: boolean;
    explanation?: string;
    currentTime?: {
      timestamp: number;
      formatted: string;
    };
    contextSubtitles?: number;
    closestDialogue?: {
      text: string;
      timestamp: string;
    };
    mediaName?: string;
    error?: string;
  };
  className?: string;
  index?: number;
}

export const SceneExplainCard: React.FC<SceneExplainCardProps> = ({
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
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-sm leading-snug">
                Scene Explanation
              </h3>
              {result.currentTime?.formatted && (
                <Badge variant="secondary" className="text-xs px-1.5 py-0 h-auto">
                  <Clock className="h-3 w-3" />
                  {result.currentTime.formatted}
                </Badge>
              )}
            </div>

            {result.mediaName && (
              <p className="text-xs text-muted-foreground">{result.mediaName}</p>
            )}

            {result.closestDialogue?.text && (
              <div className="flex items-start gap-1.5">
                <MessageSquareQuote className="h-3 w-3 text-muted-foreground mt-0.5 flex-shrink-0" />
                <p className="text-xs text-muted-foreground italic line-clamp-1">
                  "{result.closestDialogue.text}"
                </p>
              </div>
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
