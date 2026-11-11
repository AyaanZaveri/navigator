"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { useMetadataWarmup, useStreamQueries } from "@/components/stream-query-provider";
import { useSettings } from "@/contexts/settings-context";
import { EpisodeContinuation, shouldPrefetchEpisode } from "./episode-continuation";
import { fetchFollowingEpisode, prepareNextEpisode } from "./prefetch-next-episode";
import { preloadNextVideo, videoPreloadAllowed } from "./preload-next-video";
import { getPlaybackTitles } from "./playback-titles";
import { DEFAULT_PLAYBACK_PREFERENCES } from "./playback-preferences";
import type { MediaToPlay } from "@/lib/atoms";
import type { Episode } from "@/app/actions/tv-shows";

export function useEpisodeContinuation(options: {
  media: MediaToPlay | null; visible: boolean; native: boolean; time?: number; duration: number; creditsStart?: number;
  mediaRef?: RefObject<HTMLVideoElement | null>;
  play(_media: MediaToPlay): void; beforeAdvance(_ended: boolean): void; finish(): void;
}) {
    const { playbackPreferences = DEFAULT_PLAYBACK_PREFERENCES } = useSettings();
    const streamQueries = useStreamQueries();
    const metadataWarmer = useMetadataWarmup();
    const latest = useRef(options);
    useLayoutEffect(() => { latest.current = options; });
    const titles = options.media ? getPlaybackTitles(options.media, options.media.details || null) : null;
    const id = options.media?.seriesId || options.media?.id;
    const season = titles?.season, episode = titles?.episodeNumber;
    const key = options.visible && titles?.isEpisode && id && season !== undefined && episode !== undefined ? `${id}:${season}:${episode}` : "";
    const [snapshot, setSnapshot] = useState<{ owner: string; next: Episode | null; busy: boolean }>({ owner: "", next: null, busy: false });
    const ended = useRef<string | null>(null);
    const owner = useRef<{ key: string; continuation: EpisodeContinuation } | null>(null);
    useEffect(() => {
        ended.current = null;
        if (!key) { owner.current = null; return; }
        const continuation = new EpisodeContinuation({
            current: () => latest.current.media!, season: season!, episode: episode!,
            isCurrent: () => {
                const current = latest.current;
                if (!current.visible || !current.media) return false;
                const target = getPlaybackTitles(current.media, current.media.details || null);
                return `${current.media.seriesId || current.media.id}:${target.season}:${target.episodeNumber}` === key;
            },
            lookup: signal => fetchFollowingEpisode(id!, season!, episode!, signal),
            prepare: (media, signal) => prepareNextEpisode(media, options.native, signal, streamQueries?.create, streamQueries?.metadata?.details),
            warm: (media, signal) => preloadNextVideo(media, options.native, latest.current.duration, signal),
            beforeAdvance: value => latest.current.beforeAdvance(value),
            play: media => latest.current.play(media),
        });
        owner.current = { key, continuation };
        let cancelled = false;
        void continuation.next().then(next => {
            if (cancelled) return;
            setSnapshot({ owner: key, next, busy: false });
            if (next && latest.current.media) metadataWarmer?.enqueue({ ...latest.current.media,
                id: id!, seriesId: id!, mediaSourceId: next.id, seasonNumber: next.season, episodeNumber: next.episode,
                episodeTitle: next.title, name: next.title });
        });
        return () => { cancelled = true; continuation.dispose(); };
    }, [key, id, season, episode, options.native, streamQueries, metadataWarmer]);
    useEffect(() => {
        if (!playbackPreferences.episodePrefetch && owner.current?.key === key) owner.current.continuation.cancelPrefetch();
    }, [key, playbackPreferences.episodePrefetch]);
    useEffect(() => {
        const node = options.mediaRef?.current;
        const update = () => {
            if (node?.ended || (options.duration > 0 && (node?.currentTime ?? 0) >= options.duration - .1)) return;
            const canLoad = videoPreloadAllowed(node);
            // Compatibility checks themselves load/decode video. Give those
            // the same spare-bandwidth gate as the actual standby buffer.
            const checksVideo = !options.native && playbackPreferences.autoSelectWebStream;
            if (!videoPreloadAllowed(node, 5) && owner.current?.key === key) {
                if (checksVideo) owner.current.continuation.cancelPrefetch();
                else owner.current.continuation.suspendVideoPrefetch();
            }
            if (playbackPreferences.episodePrefetch && shouldPrefetchEpisode(node?.currentTime ?? options.time ?? 0, options.duration, options.creditsStart)
        && (!checksVideo || canLoad) && owner.current?.key === key) void owner.current.continuation.prefetch(canLoad);
        };
        update();
        node?.addEventListener("timeupdate", update);
        node?.addEventListener("progress", update);
        node?.addEventListener("pause", update); node?.addEventListener("waiting", update); node?.addEventListener("seeking", update);
        document.addEventListener("visibilitychange", update);
        return () => {
            for (const event of ["timeupdate", "progress", "pause", "waiting", "seeking"]) node?.removeEventListener(event, update);
            document.removeEventListener("visibilitychange", update);
        };
    }, [key, options.time, options.duration, options.creditsStart, options.mediaRef, options.native, playbackPreferences.episodePrefetch, playbackPreferences.autoSelectWebStream]);
    const advance = async (automatic = false) => {
        const continuation = owner.current?.key === key ? owner.current.continuation : null;
        if (!continuation?.active) return false;
        setSnapshot(previous => ({ ...previous, busy: true }));
        const started = await continuation.advance(automatic);
        if (!started && continuation.active) {
            setSnapshot(previous => ({ ...previous, busy: false }));
        }
        return started;
    };
    return {
        next: snapshot.owner === key ? snapshot.next : null,
        busy: snapshot.owner === key && snapshot.busy,
        advance: () => { void advance(); },
        onEnded: () => {
            const continuation = owner.current?.key === key ? owner.current.continuation : null;
            if (!key) { latest.current.finish(); return; }
            if (!continuation) return; // Ignore a stale ended callback after changing titles.
            if (continuation.advanced || ended.current === key) return;
            ended.current = key;
            if (!playbackPreferences.episodeAutoplay) { latest.current.finish(); return; }
            void advance(true).then(started => { if (!started && continuation.active) latest.current.finish(); });
        },
    };
}
