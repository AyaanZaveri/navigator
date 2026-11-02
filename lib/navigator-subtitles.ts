export interface SubtitleEvidence {
  timestamp: number;
  endTimestamp?: number;
  timestampFormatted: string;
  text: string;
}

export function sceneSubtitles(entries: SubtitleEvidence[], timestamp: number, window: number, allowSpoilers = false) {
    return entries.filter(entry => entry.timestamp >= Math.max(0, timestamp - window)
    && (allowSpoilers ? entry.timestamp <= timestamp + window : (entry.endTimestamp ?? entry.timestamp) <= timestamp));
}

export function matchedSubtitle(entries: SubtitleEvidence[], selection: { candidate: number | null; confidence: string }) {
    if (selection.confidence !== "high" || selection.candidate === null) return null;
    if (!Number.isInteger(selection.candidate) || selection.candidate < 1 || selection.candidate > entries.length) return null;
    return entries[selection.candidate - 1];
}
