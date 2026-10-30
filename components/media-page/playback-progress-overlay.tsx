import { fetchPlaybackProgress } from "@/app/actions";

function formatResumeTime(totalSeconds: number) {
    const safeSeconds = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const seconds = safeSeconds % 60;
    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export async function PlaybackProgressOverlay({
    mediaId,
    videoId,
}: {
  mediaId: string;
  videoId: string;
}) {
    const playbackProgress = await fetchPlaybackProgress(mediaId, videoId);

    if (
        typeof playbackProgress?.progressPercent !== "number" &&
    typeof playbackProgress?.resumePositionTicks !== "number" &&
    typeof playbackProgress?.totalDuration !== "number"
    ) {
        return null;
    }

    return (
        <div className="absolute inset-x-2 bottom-2 pointer-events-none">
            <div className="mb-1 flex items-center justify-between gap-2">
                <span className="rounded-full bg-black/35 backdrop-blur-md border border-white/20 px-1.5 py-0.5 text-[11px] leading-none font-mono text-white/90">
                    {formatResumeTime(playbackProgress?.resumePositionTicks ?? 0)}
                </span>
                <span className="rounded-full bg-black/35 backdrop-blur-md border border-white/20 px-1.5 py-0.5 text-[11px] leading-none font-mono text-white/90">
                    {formatResumeTime(playbackProgress?.totalDuration ?? 0)}
                </span>
            </div>
            <div className="h-1.5 rounded-full bg-white/30 backdrop-blur-sm overflow-hidden">
                <div
                    className="h-full rounded-full bg-white/80 transition-all"
                    style={{
                        width: `${Math.max(
                            0,
                            Math.min(100, playbackProgress?.progressPercent ?? 0)
                        )}%`,
                    }}
                />
            </div>
        </div>
    );
}
