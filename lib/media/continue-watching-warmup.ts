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
) {
    const entries = new Map<string, { request: PlaybackStreamRequest; controller: AbortController; expires: number; timer: ReturnType<typeof setTimeout>; keep: boolean }>();
    const adopted = new Map<string, PlaybackStreamRequest>();
    let active = true;
    const drop = (key: string) => {
        const entry = entries.get(key);
        if (!entry) return;
        entries.delete(key); clearTimeout(entry.timer); entry.controller.abort();
    };
    const prune = () => { for (const [key, entry] of entries) if (entry.expires <= now()) drop(key); };
    const clear = () => { for (const key of entries.keys()) drop(key); };
    return {
        warm(item: Item, keep = false) {
            const target = continueWatchingTarget(item);
            if (!active || !target) return;
            prune();
            const existing = entries.get(target.key);
            if (existing) { existing.keep ||= keep; return; }
            if (entries.size >= 2) drop(entries.keys().next().value!);
            const controller = new AbortController();
            const request = create(target.id, target.type, controller.signal);
            request.speculative = true;
            request.cancel = () => controller.abort();
            const entry = { request, controller, expires: now() + 30_000, keep,
                timer: setTimeout(() => drop(target.key), 30_000) };
            entries.set(target.key, entry);
            void request.promise.then(streams => {
                if (!streams.length && entries.get(target.key) === entry) drop(target.key);
            }).catch(() => { if (entries.get(target.key) === entry) drop(target.key); });
        },
        release(item: Item) {
            const target = continueWatchingTarget(item);
            if (target && !entries.get(target.key)?.keep) drop(target.key);
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
        dispose() { active = false; clear(); adopted.clear(); },
    };
}
