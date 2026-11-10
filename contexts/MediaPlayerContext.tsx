import { useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";
import { useAccountAccess } from "@/contexts/account-context";
import {
    isPlayerVisibleAtom, currentMediaAtom, currentMediaWithSourceAtom,
    skipTimestampAtom, skipToTimestampAtom, currentTimestampAtom, playMediaAtom,
    type MediaToPlay, type CurrentMediaWithSource,
} from "@/lib/atoms";

/** Command-only consumers must not subscribe to playback state or its clock. */
export function usePlaybackActions() {
    const { authenticated, requestSignIn } = useAccountAccess();
    const play = useSetAtom(playMediaAtom);
    const setVisible = useSetAtom(isPlayerVisibleAtom);
    const playMedia = useCallback((media: MediaToPlay) => {
        if (!authenticated) { requestSignIn(); return; }
        play(media);
    }, [authenticated, requestSignIn, play]);
    const setIsPlayerVisible = useCallback<typeof setVisible>((visible) => {
        if (!authenticated && visible !== false) { requestSignIn(); return; }
        setVisible(visible);
    }, [authenticated, requestSignIn, setVisible]);
    return {
        playMedia,
        setIsPlayerVisible,
        setCurrentMediaWithSource: useSetAtom(currentMediaWithSourceAtom),
        setCurrentTimestamp: useSetAtom(currentTimestampAtom),
        skipToTimestamp: useSetAtom(skipToTimestampAtom),
    };
}

export function useIsPlayerVisible() {
    return useAtomValue(isPlayerVisibleAtom);
}

/** The rapidly changing clock is an explicit opt-in, separate from media state. */
export function usePlaybackTimestamp() {
    return useAtomValue(currentTimestampAtom);
}

export function useMediaPlayer() {
    return {
        ...usePlaybackActions(),
        isPlayerVisible: useIsPlayerVisible(),
        currentMedia: useAtomValue(currentMediaAtom),
        currentMediaWithSource: useAtomValue(currentMediaWithSourceAtom),
        skipTimestamp: useAtomValue(skipTimestampAtom),
    };
}

export type { MediaToPlay, CurrentMediaWithSource };
