/** Map one selected title before asking Stremio add-ons for streams/subtitles. */
export async function fetchPlaybackId(id: string, type: "movie" | "series", signal?: AbortSignal): Promise<string> {
    const response = await fetch("/api/playback/id?" + new URLSearchParams({ id, type }), { signal });
    const data = await response.json() as { id?: string; error?: string };
    if (!response.ok || !data.id) throw new Error(data.error || "Could not resolve this title for playback.");
    return data.id;
}
