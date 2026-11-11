import { PlaybackPageProvider } from "@/components/playback-page-provider";
import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { MediaItem } from "@/types/stremio";
import type { Episode } from "@/app/actions/tv-shows";
import { metadataIdentity } from "@/lib/server/metadata-identity";
import { serverMetadataCache } from "@/lib/server/metadata-cache";
import { metadataKey, titleEnvelope, episodeEnvelope, METADATA_DEFAULTS } from "@/lib/media/metadata";

/** Deliberately dehydrate metadata alone. Stream URLs never enter server HTML. */
export async function MetadataHydration({ media, episode, children }: { media: MediaItem; episode?: Episode; children: ReactNode }) {
    const { scope, revision } = await metadataIdentity();
    const client = new QueryClient({ defaultOptions: { queries: METADATA_DEFAULTS } });
    const id = media.imdbId || media.id;
    const record = titleEnvelope(media, serverMetadataCache.fetchedAt(media));
    client.setQueryData(["metadata", scope, "config"], { revision });
    client.setQueryData(["metadata", scope, "identity", media.type, media.id], id);
    client.setQueryData(metadataKey(scope, revision, media.type, id), record, { updatedAt: record.fetchedAt });
    if (episode) {
        const item = episodeEnvelope(episode, id, serverMetadataCache.fetchedAt(episode));
        client.setQueryData(metadataKey(scope, revision, media.type, id, episode.season, episode.episode), item, { updatedAt: item.fetchedAt });
    }
    const state = dehydrate(client, { shouldDehydrateQuery: q => q.queryKey[0] === "metadata" });
    client.clear();
    return <HydrationBoundary state={state}>{children}</HydrationBoundary>;
}

export function MetadataPage({ media, children }: { media: MediaItem; children: ReactNode }) {
    return <MetadataHydration media={media}><PlaybackPageProvider media={media}>{children}</PlaybackPageProvider></MetadataHydration>;
}
