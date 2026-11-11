'use client';

import { createContext, useContext, useLayoutEffect, useMemo, useCallback, useSyncExternalStore, type ReactNode } from 'react';
import { useMetadataQueries } from '@/components/stream-query-provider';
import { metadataDetails } from '@/lib/media/metadata';
import { mergePlaybackDetails } from '@/lib/media/playback-details';
import { useSetAtom } from 'jotai';
import { playbackPageContextAtom } from '@/lib/atoms';
import type { MediaItem } from '@/types/stremio';
import type { PlaybackPageContext } from '@/lib/media/playback-context';

const PageContext = createContext<PlaybackPageContext | null>(null);
export const usePlaybackPage = () => useContext(PageContext);

export function PlaybackPageProvider({ media, children }: { media: MediaItem; children: ReactNode }) {
    const metadata = useMetadataQueries();
    const subscribe = useCallback((notify: () => void) => metadata?.observe(media, notify) || (() => {}), [metadata, media]);
    const snapshot = useCallback(() => metadata?.peek(media).title, [metadata, media]);
    const record = useSyncExternalStore(subscribe, snapshot, () => undefined);
    const page = useMemo<PlaybackPageContext>(() => ({ media: record ? mergePlaybackDetails(media, metadataDetails(record)) : media }), [media, record]);
    const setPage = useSetAtom(playbackPageContextAtom);
    useLayoutEffect(() => {
        setPage(page);
        return () => setPage(current => current === page ? null : current);
    }, [page, setPage]);
    return <PageContext.Provider value={page}>{children}</PageContext.Provider>;
}
