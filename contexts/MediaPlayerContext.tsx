import { useAtomValue, useSetAtom } from "jotai";
import {
    isPlayerVisibleAtom, currentMediaAtom, currentMediaWithSourceAtom,
    skipTimestampAtom, skipToTimestampAtom, currentTimestampAtom, playMediaAtom,
    type MediaToPlay, type CurrentMediaWithSource,
} from "@/lib/atoms";

/** Command-only consumers must not subscribe to playback state or its clock. */
export function usePlaybackActions() {
    return {
        playMedia: useSetAtom(playMediaAtom),
        setIsPlayerVisible: useSetAtom(isPlayerVisibleAtom),
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
