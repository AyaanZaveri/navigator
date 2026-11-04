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
      ? <img src={details.flag} width={24} height={24} alt="" draggable={false} className="block size-6 shrink-0 rounded-full object-cover" />
      : <Languages className="size-4" />}
    metadata={<>
      {track.provider && <ResultMeta>{track.provider}</ResultMeta>}
      <ResultMeta>{track.lineCount.toLocaleString("en-US")} lines</ResultMeta>
    </>}
  />;
}
