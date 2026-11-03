"use client";

import { Languages, Subtitles } from "lucide-react";
import { describeTrack } from "@/lib/media/track-label";
import type { SceneProgress } from "@/lib/navigator-scene-progress";
import { ResultBadge, ResultCard, ResultMeta } from "./result-card";

export function SubtitleTrackCard({ track }: { track: NonNullable<SceneProgress["subtitles"]> }) {
  const details = describeTrack(track, track.index);
  return <ResultCard
    title={details.label}
    icon={Subtitles}
    iconContent={details.flag
      ? <img src={details.flag} width={16} height={16} alt="" draggable={false} className="size-4 rounded-full" />
      : <Languages className="size-4" />}
    metadata={<>
      {details.badge && <ResultBadge>{details.badge}</ResultBadge>}
      <ResultMeta>{track.lineCount.toLocaleString("en-US")} lines</ResultMeta>
    </>}
    description={details.description}
  />;
}
