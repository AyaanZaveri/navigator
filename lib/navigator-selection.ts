export type MediaResult = Record<string, unknown> & { id: string | number };
export const mediaResultTools = new Set(["searchMedia", "getFilmography", "getEpisodes", "getEpisodeCatalog", "findEpisode", "findEpisodeByTitle", "verifyEpisode", "presentMediaResults"]);

export function rememberMediaResults(store: Map<string, MediaResult>, items: MediaResult[]) {
    for (const item of items) {
        const id = String(item.id), type = String(item.type ?? "").toLowerCase();
        if (["movie", "series", "episode"].includes(type)) {
            store.set(`${type}:${id}`, item);
            if (["movie", "series", "episode"].some(other => other !== type && store.has(`${other}:${id}`))) { store.delete(id); continue; }
        }
        store.set(id, item);
    }
}

export function successfulMediaResults(output: unknown): MediaResult[] {
    if (!output || typeof output !== "object" || (output as any).success !== true) return [];
    const obj = output as any;
    const values = Array.isArray(obj.results) ? obj.results : Array.isArray(obj.episodes) ? obj.episodes : Array.isArray(obj.credits) ? obj.credits : [];
    return values.filter((item: any) => item && typeof item === "object" && (typeof item.id === "string" || typeof item.id === "number")) as MediaResult[];
}

export function seedMediaResults(store: Map<string, MediaResult>, parts: unknown[]) {
    for (const raw of parts) {
        if (!raw || typeof raw !== "object") continue;
        const part = raw as Record<string, any>;
        const name = part.type === "dynamic-tool" ? part.toolName : String(part.type).replace(/^tool-/, "");
        if (!mediaResultTools.has(name) || part.state !== "output-available") continue;
        rememberMediaResults(store, successfulMediaResults(part.output));
    }
}

export function selectMediaResults(ids: string[], store: Map<string, MediaResult>, heading?: string) {
    const deduplicated = [...new Set(ids)];
    const missing = deduplicated.filter(id => !store.has(id));
    if (missing.length) return { success: false as const, error: `Unknown, ambiguous, or unavailable media result ID(s): ${missing.join(", ")}. Use the returned presentationId when available. No results were published.` };
    const selected = deduplicated.map(id => store.get(id)!);
    return { success: true as const, presentation: "selection" as const, heading, results: selected.filter((item, index) =>
        selected.findIndex(other => String(other.id) === String(item.id) && String(other.type).toLowerCase() === String(item.type).toLowerCase()) === index) };
}
