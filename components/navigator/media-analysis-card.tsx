"use client";

import { ScanText } from "lucide-react";
import { ResultCard, ResultBadge } from "./result-card";

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

export function MediaAnalysisCard({
  result,
  className,
  index = 0,
}: MediaAnalysisCardProps) {
  return (
    <ResultCard
      className={className}
      index={index}
      title="Media analysis"
      icon={ScanText}
      metadata={
        result.analyzedSubtitleCount != null && (
          <ResultBadge>
            {result.analyzedSubtitleCount} subtitles analyzed
          </ResultBadge>
        )
      }
      description={
        <>
          {result.mediaName && (
            <span className="block">{result.mediaName}</span>
          )}
          {result.question}
        </>
      }
      error={!result.success ? result.error : undefined}
    />
  );
}
