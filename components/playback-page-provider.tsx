'use client';

import { createContext, useContext, useLayoutEffect, useMemo, type ReactNode } from 'react';
import { useSetAtom } from 'jotai';
import { playbackPageContextAtom } from '@/lib/atoms';
import type { MediaItem } from '@/types/stremio';
import type { PlaybackPageContext } from '@/lib/media/playback-context';

const PageContext = createContext<PlaybackPageContext | null>(null);
export const usePlaybackPage = () => useContext(PageContext);

export function PlaybackPageProvider({ media, children }: { media: MediaItem; children: ReactNode }) {
    const page = useMemo<PlaybackPageContext>(() => ({ media, streamRequests: new Map() }), [media]);
    const setPage = useSetAtom(playbackPageContextAtom);
    useLayoutEffect(() => {
        setPage(page);
        return () => setPage(current => current === page ? null : current);
    }, [page, setPage]);
    return <PageContext.Provider value={page}>{children}</PageContext.Provider>;
}
