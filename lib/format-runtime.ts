/** Metadata runtimes arrive as minutes, "126 min", or compact strings like "2h6min". */
export function formatRuntime(value?: number | string | null): string | undefined {
    if (value == null || value === "") return undefined;
    let minutes: number;
    if (typeof value === "number") minutes = value;
    else {
        const text = value.trim();
        if (!text) return undefined;
        if (/^\d+(?:\.\d+)?$/.test(text)) minutes = Number(text);
        else {
            const match = /^(?:(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\s*,?\s*)?(?:(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|m))?$/i.exec(text);
            if (!match || (!match[1] && !match[2])) return text;
            minutes = Number(match[1] || 0) * 60 + Number(match[2] || 0);
        }
    }
    if (!Number.isFinite(minutes) || minutes < 0) return undefined;
    const total = Math.round(minutes);
    const hours = Math.floor(total / 60), remainder = total % 60;
    if (!hours) return `${remainder}m`;
    return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}
