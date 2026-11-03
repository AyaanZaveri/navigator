"use client";

import { Languages } from "lucide-react";
import { describeTrack } from "@/lib/media/track-label";
import type { SceneProgress } from "@/lib/navigator-scene-progress";
import { ResultCard, ResultMeta } from "./result-card";

export function SubtitleTrackCard({ track }: { track: NonNullable<SceneProgress["subtitles"]> }) {
  const details = describeTrack(track, track.index);
  return <ResultCard
    title={details.label}
    iconContent={details.flag
      ? <img src={details.flag} width={20} height={20} alt="" draggable={false} className="size-5 rounded-full" />
      : <Languages className="size-4" />}
    metadata={<ResultMeta>{track.lineCount.toLocaleString("en-US")} lines</ResultMeta>}
    description={details.description}
  />;
}
