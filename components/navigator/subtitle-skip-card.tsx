"use client";

import { Subtitles } from "lucide-react";
import { ResultCard, ResultBadge } from "./result-card";

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

export function SubtitleSkipCard({
  result,
  className,
  index = 0,
}: SubtitleSkipCardProps) {
  return (
    <ResultCard
      className={className}
      index={index}
      title={result.success ? "Matching scene" : "Subtitle search failed"}
      icon={Subtitles}
      metadata={
        result.timestampFormatted && (
          <ResultBadge>{result.timestampFormatted}</ResultBadge>
        )
      }
      description={
        result.text && <span className="italic">“{result.text}”</span>
      }
      error={!result.success ? result.error : undefined}
    />
  );
}
