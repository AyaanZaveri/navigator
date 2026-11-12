export interface ParsedSubtitleEntry {
    timestamp: number;
    endTimestamp?: number;
    timestampFormatted: string;
    text: string;
}

function timestamp(value: string): number | null {
    const parts = value.trim().replace(",", ".").split(":");
    if (parts.length < 2 || parts.length > 3 || parts.some(part => !part.trim())) return null;
    const numbers = parts.map(Number);
    if (numbers.some(number => !Number.isFinite(number) || number < 0)) return null;
    return numbers.at(-1)! + numbers.at(-2)! * 60 + (numbers.length === 3 ? numbers[0] * 3600 : 0);
}

/** Shared SRT/WebVTT parser. Cues retain file time; playback delay is separate. */
export function parseSubtitleTextContent(content: string): ParsedSubtitleEntry[] {
    return content.replace(/^\uFEFF/, "").replace(/\r/g, "").split(/\n{2,}/).flatMap(block => {
        const lines = block.trim().split("\n").map(line => line.trimEnd());
        const index = lines.findIndex(line => line.includes("-->"));
        if (index < 0) return [];
        const [start, finish] = lines[index].split("-->").map(part => part.trim());
        const time = timestamp(start || ""), end = timestamp(finish?.split(/\s/)[0] || "");
        const text = lines.slice(index + 1).filter(Boolean).join("\n");
        if (time === null || !text || (end !== null && end < time)) return [];
        return [{ timestamp: time, endTimestamp: end ?? undefined, timestampFormatted: start, text }];
    }).sort((a, b) => a.timestamp - b.timestamp);
}

export function subtitleTimestamp(seconds: number): string {
    const ms = Math.round(Math.max(0, seconds) * 1000);
    return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
}
