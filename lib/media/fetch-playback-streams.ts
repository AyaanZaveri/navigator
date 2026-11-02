import type { StremioStream } from '@/types/stremio';
import { fetchPlaybackId } from './fetch-playback-id';

export type StreamWithAddon = StremioStream & { addonId: string; addonName: string };
export interface PlaybackStreamSnapshot { streams: StreamWithAddon[]; pending: number; total: number; complete: boolean }
export interface PlaybackStreamRequest {
    id: string;
    type: string;
    canonicalId: Promise<string>;
    promise: Promise<StreamWithAddon[]>;
    snapshot: PlaybackStreamSnapshot;
    subscribe(_listener: (_snapshot: PlaybackStreamSnapshot) => void): () => void;
}

/** A page and its player share one in-flight read, including progressive results. */
export function createPlaybackStreamRequest(id: string, type: string): PlaybackStreamRequest {
    const listeners = new Set<(_snapshot: PlaybackStreamSnapshot) => void>();
    const request: PlaybackStreamRequest = {
        id, type, snapshot: { streams: [], pending: 0, total: 0, complete: false },
        canonicalId: /^tmdb:/.test(id) && (type === 'movie' || type === 'series')
            ? fetchPlaybackId(id.replace(/:(\d+):(\d+)$/, ''), type, AbortSignal.timeout(15_000)).then(base => base + id.slice(id.replace(/:(\d+):(\d+)$/, '').length))
            : Promise.resolve(id),
        promise: undefined!,
        subscribe(listener) { listeners.add(listener); listener(request.snapshot); return () => { listeners.delete(listener); }; },
    };
    const publish = (snapshot: PlaybackStreamSnapshot) => {
        request.snapshot = snapshot;
        for (const listener of listeners) listener(snapshot);
    };
    request.promise = (async () => {
        const canonicalId = await request.canonicalId;
        const targetsResponse = await fetch('/api/streams/addons?' + new URLSearchParams({ type }), { signal: AbortSignal.timeout(15_000) });
        if (!targetsResponse.ok) throw new Error('Could not fetch streams. Check your connection and try again.');
        const { addons = [] } = await targetsResponse.json() as { addons?: { id: string; name?: string }[] };
        let pending = addons.length;
        const groups: StreamWithAddon[][] = addons.map(() => []);
        const update = () => publish({ streams: groups.flat(), pending, total: addons.length, complete: pending === 0 });
        update();
        await Promise.allSettled(addons.map(async (addon, index) => {
            try {
                const params = new URLSearchParams({ mediaItemId: canonicalId, type, addonId: addon.id });
                const response = await fetch('/api/streams/addon?' + params, { signal: AbortSignal.timeout(30_000) });
                if (!response.ok) return;
                const data = await response.json() as { streams?: StremioStream[] };
                groups[index] = Array.isArray(data.streams) ? data.streams.map(stream => ({
                    ...stream, addonId: addon.id, addonName: addon.name || addon.id,
                })) : [];
            } finally { pending--; update(); }
        }));
        return request.snapshot.streams;
    })();
    return request;
}

/** HTTP reads avoid Next's serial client server-action queue. */
export async function fetchPlaybackStreams(id: string, type: string): Promise<StremioStream[]> {
    return createPlaybackStreamRequest(id, type).promise;
}
