import "server-only";
import type { MediaItem } from "@/types/stremio";
import type { Episode } from "@/app/actions/tv-shows";
import { metadataIdentity } from "./metadata-identity";
import { opaqueMetadataIdentity, serverMetadataCache } from "./metadata-cache";

/** Prefer a warmed exact record without delaying an already complete header. */
export async function cachedHeaderEpisode(show: MediaItem, season: number, episode: number) {
    const { scope, revision } = await metadataIdentity();
    for (const id of new Set([show.imdbId, show.id].filter((id): id is string => Boolean(id)))) {
        const item = serverMetadataCache.peek<Episode>(opaqueMetadataIdentity([scope, revision, "episode", id, season, episode]));
        if (item) return item;
    }
    return null;
}
