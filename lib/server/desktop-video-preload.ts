import "server-only";
import { randomUUID } from "node:crypto";

export const MAX_PRELOAD_BYTES = 32 * 1024 * 1024;
const SPECULATIVE_TTL = 6 * 60_000;
const ACTIVE_TTL = 4 * 60 * 60_000;
type Entry = { token: string; url: string; headers: Record<string, string>; data: Uint8Array;
  total: number; type: string; validator: string; active: boolean; expires: number; timer?: ReturnType<typeof setTimeout> };
type Fetch = (_url: string, _init: NonNullable<Parameters<typeof fetch>[1]>) => Promise<Response>;

/** Desktop-only loopback prefix cache. No second mpv/decoder, disk writes, or
 * complete-file buffering. Uncached bytes stream with consumer backpressure. */
export function createDesktopVideoPreload(fetcher: Fetch, now = Date.now) {
    const entries = new Map<string, Entry>();
    let warm: AbortController | undefined;
    const remove = (token: string) => { clearTimeout(entries.get(token)?.timer); entries.delete(token); };
    const touch = (entry: Entry, ttl: number) => {
        clearTimeout(entry.timer); entry.expires = now() + ttl;
        entry.timer = setTimeout(() => remove(entry.token), ttl); entry.timer.unref?.();
    };
    const prune = () => { for (const [token, entry] of entries) if (entry.expires <= now()) remove(token); };
    const headersFor = (entry: Pick<Entry, "headers">, range?: string) => ({ ...entry.headers,
        "Accept-Encoding": "identity", ...(range ? { Range: range } : {}) });
    return {
        async prepare(url: string, headers: Record<string, string>, bytes: number, signal: AbortSignal) {
            if (!Number.isFinite(bytes) || bytes < 1 || signal.aborted) return null;
            bytes = Math.min(MAX_PRELOAD_BYTES, Math.floor(bytes));
            prune(); warm?.abort();
            for (const [token, entry] of entries) if (!entry.active) remove(token);
            const controller = new AbortController(); warm = controller;
            const combined = AbortSignal.any([signal, controller.signal, AbortSignal.timeout(20_000)]);
            try {
                const response = await fetcher(url, { headers: headersFor({ headers }, `bytes=0-${bytes - 1}`), signal: combined });
                const match = /^bytes 0-(\d+)\/(\d+)$/.exec(response.headers.get("Content-Range") || "");
                const length = match ? Number(match[1]) + 1 : 0, total = match ? Number(match[2]) : 0;
                const etag = response.headers.get("ETag");
                const validator = etag && !etag.startsWith("W/") ? etag : response.headers.get("Last-Modified");
                const type = response.headers.get("Content-Type") || "application/octet-stream";
                // Joining cached bytes to a different version of a file is unsafe.
                // HLS playlists/segments require a retained player, not a file prefix.
                if (response.status !== 206 || !response.body || !validator || !Number.isSafeInteger(total)
          || total < length || length < 1 || length > bytes || /mpegurl|dash\+xml|text\//i.test(type)
          || ![null, "identity"].includes(response.headers.get("Content-Encoding"))) {
                    await response.body?.cancel(); return null;
                }
                const reader = response.body.getReader(), data = new Uint8Array(length);
                let received = 0;
                try {
                    while (true) {
                        combined.throwIfAborted();
                        const { value, done } = await reader.read(); if (done) break;
                        if (received + value.byteLength > length) throw Error("Unbounded preload response");
                        data.set(value, received); received += value.byteLength;
                    }
                } catch (error) { await reader.cancel().catch(() => {}); throw error; }
                if (received !== length || combined.aborted) return null;
                if (new TextDecoder().decode(data.subarray(0, 16)).trimStart().startsWith("#EXTM3U")) return null;
                const token = randomUUID();
                const entry: Entry = { token, url, headers, data, total, type, validator, active: false, expires: 0 };
                entries.set(token, entry); touch(entry, SPECULATIVE_TTL);
                return token;
            } catch { return null; }
            finally { if (warm === controller) warm = undefined; }
        },
        release(token: string, includeActive = false) { const entry = entries.get(token); if (entry && (!entry.active || includeActive)) remove(token); },
        async serve(token: string, request: Request): Promise<Response> {
            prune(); const entry = entries.get(token);
            if (!entry) return new Response(null, { status: 404 });
            entry.active = true; touch(entry, ACTIVE_TTL);
            // Only the current player and one following episode retain memory.
            for (const [key, previous] of entries) if (key !== token && previous.active) remove(key);
            const range = request.headers.get("Range");
            const match = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
            if (range && !match) {
                return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${entry.total}` } });
            }
            const suffix = match && !match[1];
            const start = suffix ? Math.max(0, entry.total - Number(match[2])) : match ? Number(match[1]) : 0;
            const end = !suffix && match?.[2] ? Math.min(Number(match[2]), entry.total - 1) : entry.total - 1;
            if ((suffix && (!match[2] || Number(match[2]) <= 0)) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start < 0) {
                return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${entry.total}` } });
            }
            const headers = new Headers({ "Content-Type": entry.type, "Content-Length": String(end - start + 1),
                "Accept-Ranges": "bytes", "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" });
            if (range) headers.set("Content-Range", `bytes ${start}-${end}/${entry.total}`);
            if (request.method === "HEAD") return new Response(null, { status: range ? 206 : 200, headers });
            const controller = new AbortController();
            const signal = AbortSignal.any([request.signal, controller.signal]);
            const prefixEnd = Math.min(end + 1, entry.data.length);
            let offset = start, reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
            const body = new ReadableStream<Uint8Array>({
                async pull(output) {
                    try {
                        signal.throwIfAborted();
                        if (offset < prefixEnd) {
                            const next = Math.min(offset + 64 * 1024, prefixEnd);
                            output.enqueue(entry.data.subarray(offset, next)); offset = next; return;
                        }
                        if (offset > end) { output.close(); controller.abort(); return; }
                        if (!reader) {
                            const response = await fetcher(entry.url, { headers: { ...headersFor(entry, `bytes=${offset}-${end}`),
                                "If-Range": entry.validator }, signal });
                            if (response.status !== 206 || response.headers.get("Content-Range") !== `bytes ${offset}-${end}/${entry.total}` || !response.body) {
                                await response.body?.cancel(); throw Error("Stream changed since preload");
                            }
                            reader = response.body.getReader();
                        }
                        const chunk = await reader.read();
                        if (chunk.done) {
                            if (offset <= end) throw Error("Incomplete video response");
                            output.close(); controller.abort(); return;
                        }
                        if (offset + chunk.value.byteLength > end + 1) throw Error("Invalid video range");
                        offset += chunk.value.byteLength; output.enqueue(chunk.value);
                    } catch (error) { controller.abort(); await reader?.cancel().catch(() => {}); output.error(error); }
                },
                async cancel() { controller.abort(); await reader?.cancel().catch(() => {}); },
            });
            return new Response(body, { status: range ? 206 : 200, headers });
        },
    };
}
