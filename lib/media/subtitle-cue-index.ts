export interface SubtitleCue { timestamp: number; endTimestamp?: number; text: string }

/** Reuse prepared cue objects as external-store snapshots. The current interval
 * is O(1); seeks use an upper-bound search, preserving last-started cue rules. */
export function createSubtitleCueIndex<T>(cues: SubtitleCue[], prepare: (_text: string) => T) {
    const prepared = cues.map(cue => ({ ...cue, value: prepare(cue.text) }));
    let cursor = -1;
    return (time: number): T | null => {
        if (!Number.isFinite(time)) return null;
        if (cursor < 0 || time < prepared[cursor].timestamp || (prepared[cursor + 1]?.timestamp ?? Infinity) <= time) {
            let lo = 0, hi = prepared.length;
            while (lo < hi) {
                const mid = (lo + hi) >>> 1;
                if (prepared[mid].timestamp <= time) lo = mid + 1;
                else hi = mid;
            }
            cursor = lo - 1;
        }
        const cue = prepared[cursor];
        if (!cue) return null;
        return (cue.endTimestamp !== undefined ? time <= cue.endTimestamp : time - cue.timestamp <= 5) ? cue.value : null;
    };
}
