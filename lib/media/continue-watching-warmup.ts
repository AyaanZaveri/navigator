import type { MediaItem } from "@/types/stremio";
import { createPlaybackStreamRequest, type PlaybackStreamRequest } from "./fetch-playback-streams";

type Item = Pick<MediaItem, "id" | "type" | "mediaSourceId" | "streamUrl">;
export function continueWatchingTarget(item: Item) {
    if (item.streamUrl || (item.type !== "movie" && item.type !== "series")) return null;
    const id = item.mediaSourceId || item.id;
    // Never guess a different episode when the resume item has no video target.
    if (item.type === "series" && !item.mediaSourceId && !/:\d+:\d+$/.test(id)) return null;
    return { id, type: item.type, key: `${item.type}:${id}` };
}

/** Owned by one mounted, account-keyed home page. Claim transfers the exact
 * in-flight request to playback; disposal only aborts still-speculative work. */
export function createContinueWatchingWarmup(
    create: typeof createPlaybackStreamRequest = createPlaybackStreamRequest,
    now: () => number = () => performance.now(),
    retainOnDispose = false,
) {
    const entries = new Map<string, { request: PlaybackStreamRequest; controller: AbortController; expires: number; timer: ReturnType<typeof setTimeout>; keep: boolean; pending: boolean; cancelUnclaimed?: () => void }>();
    const adopted = new Map<string, PlaybackStreamRequest>();
    let active = true;
    const drop = (key: string, cancelUnclaimed = false) => {
        const entry = entries.get(key);
        if (!entry) return;
        entries.delete(key); clearTimeout(entry.timer); entry.controller.abort();
        if (cancelUnclaimed) entry.cancelUnclaimed?.();
    };
    const prune = () => { for (const [key, entry] of entries) if (entry.expires <= now()) drop(key); };
    const clear = () => { for (const key of entries.keys()) drop(key, true); };
    return {
        warm(item: Item, keep = false) {
            const target = continueWatchingTarget(item);
            if (!active || !target) return;
            prune();
            const existing = entries.get(target.key);
            if (existing) { existing.keep ||= keep; return existing.request; }
            const pending = [...entries].filter(([, entry]) => entry.pending);
            if (pending.length >= 2) drop(pending[0][0], true);
            if (entries.size >= 4) {
                const settled = [...entries].find(([, entry]) => !entry.pending);
                if (settled) drop(settled[0]);
            }
            const controller = new AbortController();
            const request = create(target.id, target.type, controller.signal);
            const cancelUnclaimed = request.cancel;
            request.speculative = true;
            request.cancel = () => controller.abort();
            const entry = { request, controller, expires: now() + 30_000, keep, pending: true, cancelUnclaimed,
                timer: setTimeout(() => drop(target.key), 30_000) };
            entries.set(target.key, entry);
            void request.promise.then(streams => {
                entry.pending = false;
                if (!streams.length && entries.get(target.key) === entry) drop(target.key);
            }).catch(() => { if (entries.get(target.key) === entry) drop(target.key); });
            return request;
        },
        release(item: Item) {
            const target = continueWatchingTarget(item);
            if (target && !entries.get(target.key)?.keep) drop(target.key);
        },
        cancel(item: Item) {
            const target = continueWatchingTarget(item);
            if (target) drop(target.key, true);
        },
        claim(item: Item) {
            if (!active) return undefined;
            prune();
            const target = continueWatchingTarget(item);
            if (!target) return undefined;
            const shared = adopted.get(target.key);
            if (shared) return shared;
            // A click promotes a queued/not-yet-started warmup immediately.
            if (!entries.has(target.key)) this.warm(item);
            const entry = entries.get(target.key);
            if (!entry) return undefined;
            entries.delete(target.key); clearTimeout(entry.timer);
            adopted.set(target.key, entry.request);
            return entry.request;
        },
        clear,
        dispose() {
            active = false;
            if (retainOnDispose) { for (const entry of entries.values()) clearTimeout(entry.timer); entries.clear(); }
            else clear();
            adopted.clear();
        },
    };
}
