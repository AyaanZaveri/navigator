import type { SearchCatalogSection } from "@/types/stremio";

export async function fetchSearchSuggestions(
    query: string,
    onSections: (_sections: SearchCatalogSection[]) => void,
    signal: AbortSignal,
): Promise<void> {
    const response = await fetch(`/api/search/suggestions?${new URLSearchParams({ q: query })}`, { signal, cache: "no-store" });
    if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error || "Search is unavailable");
    }
    if (!response.body) throw new Error("Search is unavailable");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = "";
    const publish = (line: string) => {
        if (!line.trim()) return;
        const message = JSON.parse(line) as { sections?: SearchCatalogSection[] };
        signal.throwIfAborted();
        if (Array.isArray(message.sections)) onSections(message.sections);
    };
    try {
        while (true) {
            const { value, done } = await reader.read();
            signal.throwIfAborted();
            pending += decoder.decode(value, { stream: !done });
            let newline: number;
            while ((newline = pending.indexOf("\n")) !== -1) {
                publish(pending.slice(0, newline));
                pending = pending.slice(newline + 1);
            }
            if (done) { publish(pending); return; }
        }
    } catch (error) {
        await reader.cancel().catch(() => {});
        throw error;
    } finally {
        reader.releaseLock();
    }
}
