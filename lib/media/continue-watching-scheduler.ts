import { continueWatchingTarget, type createContinueWatchingWarmup } from "./continue-watching-warmup";
import type { MediaItem } from "@/types/stremio";

type Item = Pick<MediaItem, "id" | "type" | "mediaSourceId" | "streamUrl">;
type Owner = ReturnType<typeof createContinueWatchingWarmup>;
type Running = { item: Item; automatic: boolean; intents: number };

/** Four visible candidates, two discoveries at once. Actual Play bypasses the
 * speculative queue, and deliberate intent can preempt an automatic lookup. */
export function createContinueWatchingScheduler(owner: Owner, options: {
    candidates: () => Item[];
    allowed: () => boolean;
}) {
    const running = new Map<string, Running>();
    const attempted = new Set<string>();
    let disposed = false, paused = false, claimed = false;
    const candidates = () => {
        const unique = new Map<string, Item>();
        for (const item of options.candidates()) {
            const target = continueWatchingTarget(item);
            if (target) unique.set(target.key, item);
            if (unique.size === 4) break;
        }
        return unique;
    };
    const start = (item: Item, automatic: boolean): Running | undefined => {
        const target = continueWatchingTarget(item);
        if (!target || disposed || paused) return;
        const request = owner.warm(item, automatic);
        if (!request) return;
        const entry = { item, automatic, intents: automatic ? 0 : 1 };
        running.set(target.key, entry);
        if (automatic) attempted.add(target.key);
        const finished = () => {
            if (running.get(target.key) !== entry) return;
            running.delete(target.key);
            pump();
        };
        void request.promise.then(finished, finished);
        return entry;
    };
    const pump = () => {
        if (disposed || paused || !options.allowed()) return;
        for (const [key, item] of candidates()) {
            if (running.size >= 2) break;
            if (!attempted.has(key) && !running.has(key)) start(item, true);
        }
    };
    return {
        refresh() {
            if (disposed || claimed || !options.allowed()) return;
            paused = false;
            const visible = candidates();
            for (const [key, entry] of running) if (entry.automatic && !entry.intents && !visible.has(key)) {
                running.delete(key); attempted.delete(key); owner.cancel(entry.item);
            }
            pump();
        },
        intent(item: Item) {
            const target = continueWatchingTarget(item);
            if (!target || disposed || claimed) return () => {};
            paused = false;
            let entry = running.get(target.key);
            if (entry) entry.intents++;
            else {
                if (running.size >= 2) {
                    const [key, replaced] = [...running].find(([, value]) => !value.intents) || [...running][0];
                    running.delete(key); attempted.delete(key); owner.cancel(replaced.item);
                }
                entry = start(item, false);
            }
            let active = true;
            return () => {
                if (!active || !entry) return;
                active = false; entry.intents--;
                if (!entry.automatic && !entry.intents && running.get(target.key) === entry) {
                    running.delete(target.key); owner.release(item); pump();
                }
            };
        },
        claim(item: Item) {
            paused = true; claimed = true;
            const request = owner.claim(item);
            // claim removes the adopted request before clearing speculation.
            owner.clear(); running.clear();
            return request;
        },
        clear() { paused = true; running.clear(); attempted.clear(); owner.clear(); },
        dispose() { disposed = true; running.clear(); owner.dispose(); },
    };
}
