"use client";

import { Radio, Check } from "lucide-react";
import { ResultCard, ResultBadge } from "./result-card";

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

export function StreamCard({
  stream,
  isBest = false,
  className,
  index = 0,
}: StreamCardProps) {
  const title =
    stream.title || stream.name || stream.filename || "Unknown stream";
  const size = stream.videoSize
    ? stream.videoSize >= 1024 ** 3
      ? `${(stream.videoSize / 1024 ** 3).toFixed(1)} GB`
      : `${(stream.videoSize / 1024 ** 2).toFixed(0)} MB`
    : undefined;
  return (
    <ResultCard
      className={className}
      index={index}
      title={title}
      icon={isBest ? Check : Radio}
      metadata={
        <>
          {isBest && <ResultBadge>Best match</ResultBadge>}
          {stream.resolution && <ResultBadge>{stream.resolution}</ResultBadge>}
          {stream.tags?.map((tag) => (
            <ResultBadge key={tag}>{tag}</ResultBadge>
          ))}
          {size && <ResultBadge>{size}</ResultBadge>}
        </>
      }
      description={stream.addonName}
    />
  );
}
