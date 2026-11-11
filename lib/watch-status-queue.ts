import { watchHistoryKey, type WatchHistoryItem, type WatchHistoryRequest, type WatchStatusInput } from "./watch-history";

type ToggleInput = Omit<WatchStatusInput, "watched">;
interface Options {
    read: (_request: WatchHistoryRequest) => WatchHistoryItem | undefined;
    update: (_request: WatchHistoryRequest, _item: WatchHistoryItem) => void;
    save: (_input: WatchStatusInput) => Promise<WatchHistoryItem | null>;
    settled: (_request: WatchHistoryRequest) => void;
}
interface Entry {
    request: WatchHistoryRequest;
    confirmed: WatchHistoryItem;
    pending: Map<string, WatchStatusInput>;
    waiters: Map<string, ((_saved: boolean) => void)[]>;
    running: boolean;
}

const target = (input: ToggleInput) => input.type === "movie" ? "movie" : input.videoId!;
const watched = (item: WatchHistoryItem, input: ToggleInput) => input.type === "movie"
    ? item.movieWatched : item.watchedEpisodeIds.includes(input.videoId!);

function apply(item: WatchHistoryItem, input: WatchStatusInput): WatchHistoryItem {
    if (input.type === "movie") return { ...item, movieWatched: input.watched };
    const episodes = new Set(item.watchedEpisodeIds);
    if (input.watched) episodes.add(input.videoId!);
    else episodes.delete(input.videoId!);
    return { ...item, watchedEpisodeIds: [...episodes] };
}

/** Account-scoped, with one write in flight per title. Series writes update a
 * shared record, so different episodes must also save in sequence. */
export function createWatchStatusQueue(options: Options) {
    const entries = new Map<string, Entry>();
    let active = true;
    const optimistic = (entry: Entry) => [...entry.pending.values()].reduce(apply, entry.confirmed);

    async function drain(key: string, entry: Entry) {
        if (entry.running) return;
        entry.running = true;
        while (active && entries.get(key) === entry && entry.pending.size) {
            const [video, input] = entry.pending.entries().next().value!;
            let result: WatchHistoryItem | null = entry.confirmed;
            if (watched(entry.confirmed, input) !== input.watched) {
                try { result = await options.save(input); }
                catch { result = null; }
            }
            if (!active || entries.get(key) !== entry) return;
            if (result) entry.confirmed = result;
            // A newer click on this episode/movie owns the pending state.
            if (entry.pending.get(video) === input) {
                entry.pending.delete(video);
                entry.waiters.get(video)?.forEach(resolve => resolve(Boolean(result)));
                entry.waiters.delete(video);
            }
            options.update(entry.request, optimistic(entry));
        }
        if (active && entries.get(key) === entry) {
            entries.delete(key);
            options.settled(entry.request);
        }
    }

    return {
        isPending: (key: string) => entries.has(key),
        toggle(input: ToggleInput): Promise<boolean> {
            if (!active || (input.type === "series" && !input.videoId)) return Promise.resolve(false);
            const key = watchHistoryKey(input);
            let entry = entries.get(key);
            if (!entry) {
                const confirmed = options.read(input);
                if (!confirmed) return Promise.resolve(false);
                entry = { request: { id: input.id, type: input.type }, confirmed,
                    pending: new Map(), waiters: new Map(), running: false };
                entries.set(key, entry);
            }
            const video = target(input);
            const next = { ...input, watched: !watched(optimistic(entry), input) };
            entry.pending.set(video, next);
            const done = new Promise<boolean>(resolve => {
                entry.waiters.set(video, [...(entry.waiters.get(video) ?? []), resolve]);
            });
            options.update(entry.request, optimistic(entry));
            void drain(key, entry);
            return done;
        },
        dispose() {
            active = false;
            for (const entry of entries.values()) for (const waiters of entry.waiters.values()) {
                waiters.forEach(resolve => resolve(false));
            }
            entries.clear();
        },
    };
}
