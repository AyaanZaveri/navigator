"use client";

import { BookOpen } from "lucide-react";
import { ResultCard, ResultBadge } from "./result-card";
import { SubtitleEvidenceLinks } from "./subtitle-evidence";
import type { SubtitleEvidence } from "@/lib/navigator-subtitles";

interface SceneExplainCardProps {
  result: {
    success: boolean;
    evidence?: SubtitleEvidence[];
    sourceId?: string;
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

export function SceneExplainCard({
  result,
  className,
  index = 0,
}: SceneExplainCardProps) {
  return (
    <ResultCard
      className={className}
      index={index}
      title="Scene explanation"
      icon={BookOpen}
      metadata={
        result.currentTime?.formatted && (
          <ResultBadge>{result.currentTime.formatted}</ResultBadge>
        )
      }
      description={
        <>
          {result.mediaName && (
            <span className="block">{result.mediaName}</span>
          )}
          {result.closestDialogue?.text && (
            <span className="block italic">
              “{result.closestDialogue.text}”
            </span>
          )}
        </>
      }
      error={!result.success ? result.error : undefined}
    ><SubtitleEvidenceLinks evidence={result.evidence} sourceId={result.sourceId} /></ResultCard>
  );
}
