import "server-only";
import { createHash } from "node:crypto";

/** Parsed successes only. Never store Responses, bearer credentials or failures. */
export function createMetadataCache(now = Date.now) {
    const values = new Map<string, { data: unknown; at: number; bytes: number }>();
    const pending = new Map<string, Promise<unknown>>();
    const timestamps = new WeakMap<object, number>();
    let bytes = 0;
    const drop = (key: string) => { const entry = values.get(key); if (entry) bytes -= entry.bytes; values.delete(key); };
    return {
        peek<T>(key: string): T | null {
            const entry = values.get(key);
            if (!entry) return null;
            if (now() - entry.at >= 300_000) { drop(key); return null; }
            values.delete(key); values.set(key, entry);
            return entry.data as T;
        },
        fetchedAt(value: object) { return timestamps.get(value) ?? now(); },
        async read<T extends object>(key: string, load: (_signal: AbortSignal) => Promise<T | null>, signal?: AbortSignal): Promise<T | null> {
            signal?.throwIfAborted();
            for (const [id, entry] of values) if (now() - entry.at >= 300_000) drop(id);
            const cached = values.get(key);
            if (cached) { values.delete(key); values.set(key, cached); return cached.data as T; }
            let promise = pending.get(key) as Promise<T | null> | undefined;
            if (!promise) {
                if (pending.size >= 64) throw new Error("Metadata lookups are busy. Try again shortly.");
                // A route leaving must not abort another route's single-flight read.
                // Bounded upstream helpers and this deadline cap abandoned work.
                promise = load(AbortSignal.timeout(15_000)).then(data => {
                    if (!data) return null;
                    const at = now(), size = Buffer.byteLength(JSON.stringify(data));
                    timestamps.set(data, at);
                    if (size <= 16 * 1024 * 1024) {
                        values.set(key, { data, at, bytes: size }); bytes += size;
                        while (values.size > 64 || bytes > 16 * 1024 * 1024) drop(values.keys().next().value!);
                    }
                    return data;
                }).finally(() => pending.delete(key));
                pending.set(key, promise);
            }
            if (!signal) return promise;
            return new Promise<T | null>((resolve, reject) => {
                const abort = () => reject(signal.reason);
                signal.addEventListener("abort", abort, { once: true });
                if (signal.aborted) abort();
                void promise!.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
            });
        },
    };
}
export const serverMetadataCache = createMetadataCache();
export const opaqueMetadataIdentity = (parts: unknown[]) => createHash("sha256").update(JSON.stringify(parts)).digest("hex");
