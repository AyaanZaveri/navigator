import type { StremioStream } from "@/types/stremio";

/** HTTP requests run independently of Next's serial client server-action queue. */
export async function fetchPlaybackStreams(id: string, type: string): Promise<StremioStream[]> {
    const targetsResponse = await fetch("/api/streams/addons?" + new URLSearchParams({ type }));
    if (!targetsResponse.ok) throw new Error("Could not fetch streams. Check your connection and try again.");
    const { addons = [] } = await targetsResponse.json() as { addons?: { id: string }[] };
    const responses = await Promise.allSettled(addons.map(async addon => {
        const params = new URLSearchParams({ mediaItemId: id, type, addonId: addon.id });
        const response = await fetch("/api/streams/addon?" + params, { signal: AbortSignal.timeout(30_000) });
        if (!response.ok) return [];
        const data = await response.json() as { streams?: StremioStream[] };
        return Array.isArray(data.streams) ? data.streams : [];
    }));
    // Preserve configured add-on order, regardless of response timing.
    return responses.flatMap(response => response.status === "fulfilled" ? response.value : []);
}
