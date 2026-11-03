"use client";

import { formatSceneTime } from "@/lib/format-scene-time";
import { ResultCard } from "./result-card";
import styles from "./subtitle-skip-card.module.css";

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
  const time = formatSceneTime(result.timestamp, result.timestampFormatted);
  return (
    <ResultCard
      className={className}
      index={index}
      title={result.success
        ? time ? <span className={styles.time}>At {time}</span> : null
        : "Subtitle search failed"}
      error={!result.success ? result.error : undefined}
    >
      {result.text && <blockquote className={styles.quote}>“{result.text}”</blockquote>}
    </ResultCard>
  );
}
