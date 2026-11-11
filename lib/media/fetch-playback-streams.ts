import type { StremioStream } from '@/types/stremio';
import { fetchPlaybackId } from './fetch-playback-id';

export type StreamWithAddon = StremioStream & { addonId: string; addonName: string; addonIndex?: number };
export interface PlaybackStreamSnapshot { streams: StreamWithAddon[]; pending: number; total: number; complete: boolean; settledPrefix?: number }
export interface PlaybackStreamRequest {
    retain?: (_signal?: AbortSignal) => () => void;
    invalidate?: () => void;
    speculative?: boolean;
    cancel?: () => void;
    id: string;
    type: string;
    canonicalId: Promise<string>;
    promise: Promise<StreamWithAddon[]>;
    snapshot: PlaybackStreamSnapshot;
    subscribe(_listener: (_snapshot: PlaybackStreamSnapshot) => void): () => void;
}

/** A page and its player share one in-flight read, including progressive results. */
export function createPlaybackStreamRequest(id: string, type: string, signal?: AbortSignal): PlaybackStreamRequest {
    const timeout = (ms: number) => signal ? AbortSignal.any([signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms);
    const listeners = new Set<(_snapshot: PlaybackStreamSnapshot) => void>();
    const request: PlaybackStreamRequest = {
        id, type, snapshot: { streams: [], pending: 0, total: 0, complete: false },
        canonicalId: /^tmdb:/.test(id) && (type === 'movie' || type === 'series')
            ? fetchPlaybackId(id.replace(/:(\d+):(\d+)$/, ''), type, timeout(15_000)).then(base => base + id.slice(id.replace(/:(\d+):(\d+)$/, '').length))
            : Promise.resolve(id),
        promise: undefined!,
        subscribe(listener) { listeners.add(listener); listener(request.snapshot); return () => { listeners.delete(listener); }; },
    };
    const publish = (snapshot: PlaybackStreamSnapshot) => {
        request.snapshot = snapshot;
        for (const listener of listeners) listener(snapshot);
    };
    request.promise = (async () => {
        // The account's add-on list does not depend on the canonical media ID.
        // Resolve both together; stream URLs still use the validated ID below.
        const [canonicalId, targetsResponse] = await Promise.all([
            request.canonicalId,
            fetch('/api/streams/addons?' + new URLSearchParams({ type }), { signal: timeout(15_000) }),
        ]);
        if (!targetsResponse.ok) throw new Error('Could not fetch streams. Check your connection and try again.');
        const { addons = [] } = await targetsResponse.json() as { addons?: { id: string; name?: string }[] };
        let pending = addons.length;
        const groups: StreamWithAddon[][] = addons.map(() => []);
        const settled = addons.map(() => false);
        const update = () => {
            let settledPrefix = 0;
            while (settled[settledPrefix]) settledPrefix++;
            publish({ streams: groups.flat(), pending, total: addons.length, complete: pending === 0, settledPrefix });
        };
        update();
        await Promise.allSettled(addons.map(async (addon, index) => {
            try {
                const params = new URLSearchParams({ mediaItemId: canonicalId, type, addonId: addon.id });
                const response = await fetch('/api/streams/addon?' + params, { signal: timeout(30_000) });
                if (!response.ok) return;
                const data = await response.json() as { streams?: StremioStream[] };
                groups[index] = Array.isArray(data.streams) ? data.streams.map(stream => ({
                    ...stream, addonId: addon.id, addonName: addon.name || addon.id, addonIndex: index,
                })) : [];
            } finally { settled[index] = true; pending--; update(); }
        }));
        return request.snapshot.streams;
    })();
    return request;
}

/** HTTP reads avoid Next's serial client server-action queue. */
export async function fetchPlaybackStreams(id: string, type: string): Promise<StremioStream[]> {
    return createPlaybackStreamRequest(id, type).promise;
}
