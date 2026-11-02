import { getAuthData } from "@/app/actions/auth";
import { listSearchAddonTargets, searchCatalogSectionsForAddon } from "@/app/actions/search";

/** Reads belong outside the client Server Action queue. Stream fast providers
 * independently, and cancel their upstream requests when the query is replaced. */
export async function GET(request: Request) {
    const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
    if (query.length < 3 || query.length > 300) return new Response(null, { status: 400 });
    try { await getAuthData(); } catch { return new Response(null, { status: 401 }); }
    const targets = await listSearchAddonTargets();
    const lifetime = new AbortController();
    const signal = AbortSignal.any([request.signal, lifetime.signal, AbortSignal.timeout(10_000)]);
    const encoder = new TextEncoder();
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            let next = 0;
            try {
                await Promise.all(Array.from({ length: Math.min(4, targets.length) }, async () => {
                    while (next < targets.length) {
                        signal.throwIfAborted();
                        const target = targets[next++];
                        const sections = await searchCatalogSectionsForAddon(query, target.transportUrl, signal);
                        signal.throwIfAborted();
                        if (sections.length && !cancelled) controller.enqueue(encoder.encode(`${JSON.stringify({ sections })}\n`));
                    }
                }));
                signal.throwIfAborted();
                if (!cancelled) controller.close();
            } catch (error) {
                if (!cancelled) controller.error(error);
            } finally {
                lifetime.abort();
            }
        },
        cancel() { cancelled = true; lifetime.abort(); },
    });
    return new Response(stream, { headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "private, no-store", "X-Accel-Buffering": "no", "X-Content-Type-Options": "nosniff",
    } });
}
