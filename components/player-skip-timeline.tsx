import type { SkipSegment } from "@/lib/media/skip-segments";

/** Highlight the same provider ranges used by the skip buttons, without taking
 * pointer input away from the continuous seek slider. Chapter dividers sit above. */
export function PlayerSkipTimeline({ segments, start, end }: { segments: SkipSegment[]; start: number; end: number }) {
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
    return <>{segments.map((segment, index) => {
        if (!Number.isFinite(segment.start) || !Number.isFinite(segment.end) || segment.end <= segment.start) return null;
        const from = Math.max(start, segment.start), to = Math.min(end, segment.end);
        if (to <= from) return null;
        return <div key={`${segment.kind}-${segment.start}-${index}`}
            data-slot="media-player-seek-skip-range" data-kind={segment.kind}
            aria-hidden="true" className="pointer-events-none absolute inset-y-0 rounded-[2px] bg-white/20"
            style={{ left: `${(from - start) / (end - start) * 100}%`, width: `${(to - from) / (end - start) * 100}%` }} />;
    })}</>;
}
