import type { HomeCatalogResult, HomeCatalogSection, InitialHomeCatalog } from "./home-catalogs";
export interface HomeCatalogRow { key: string; result: HomeCatalogResult }

export async function retryInitialHomeCatalog(row: InitialHomeCatalog, signal: AbortSignal): Promise<HomeCatalogResult> {
    try {
        if (!row.retry) return { status: "error" };
        if ("catalog" in row.retry) {
            const response = await fetch("/api/home/catalogs", { method: "POST", signal,
                headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entries: [row.retry.catalog] }) });
            if (!response.ok) return { status: "error" };
            const data = await response.json() as { sections?: HomeCatalogSection[] };
            return { status: "ready", section: data.sections?.find(section => section.key === row.key) ?? null };
        }
        const response = await fetch("/api/discovery/home?" + new URLSearchParams({ feed: row.retry.feed }), { signal });
        if (!response.ok) return { status: "error" };
        return await response.json() as HomeCatalogResult;
    } catch { return { status: "error" }; }
}

export async function readHomeCatalogRows(response: Response, publish: (_row: HomeCatalogRow) => void, signal: AbortSignal) {
    if (!response.body) throw new Error("Missing catalog response");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "", total = 0;
    const abort = () => { void reader.cancel().catch(() => {}); };
    signal.addEventListener("abort", abort, { once: true });
    const line = (text: string) => {
        if (!text.trim()) return;
        if (text.length > 2 * 1024 * 1024) throw new Error("Catalog row too large");
        const row = JSON.parse(text) as HomeCatalogRow;
        if (typeof row.key !== "string" || !["ready", "error"].includes(row.result?.status)
            || (row.result.status === "ready" && row.result.section !== null
                && (row.result.section?.key !== row.key || !Array.isArray(row.result.section?.mediaItems)))) throw new Error("Invalid catalog row");
        publish(row);
    };
    try {
        for (;;) {
            signal.throwIfAborted();
            const chunk = await reader.read();
            signal.throwIfAborted();
            if (chunk.done) break;
            total += chunk.value.byteLength;
            if (total > 8 * 1024 * 1024) throw new Error("Catalog response too large");
            buffer += decoder.decode(chunk.value, { stream: true });
            let end: number;
            while ((end = buffer.indexOf("\n")) >= 0) { line(buffer.slice(0, end)); buffer = buffer.slice(end + 1); }
            if (buffer.length > 2 * 1024 * 1024) throw new Error("Catalog row too large");
        }
        buffer += decoder.decode(); line(buffer);
    } finally {
        signal.removeEventListener("abort", abort);
        await reader.cancel().catch(() => {}); reader.releaseLock();
    }
}
