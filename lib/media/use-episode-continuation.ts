"use client";

import { useEffect, useRef, useState } from "react";
import { useSettings } from "@/contexts/settings-context";
import { EpisodeContinuation, shouldPrefetchEpisode } from "./episode-continuation";
import { fetchFollowingEpisode, prepareNextEpisode, warmEpisodeOpening } from "./prefetch-next-episode";
import { getPlaybackTitles } from "./playback-titles";
import { DEFAULT_PLAYBACK_PREFERENCES } from "./playback-preferences";
import type { MediaToPlay } from "@/lib/atoms";
import type { Episode } from "@/app/actions/tv-shows";

export function useEpisodeContinuation(options: {
  media: MediaToPlay | null; visible: boolean; native: boolean; time: number; duration: number;
  play(media: MediaToPlay): void; beforeAdvance(ended: boolean): void; finish(): void;
}) {
  const { playbackPreferences = DEFAULT_PLAYBACK_PREFERENCES } = useSettings();
  const latest = useRef(options); latest.current = options;
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
      prepare: (media, signal) => prepareNextEpisode(media, options.native, signal),
      warm: options.native ? undefined : warmEpisodeOpening,
      beforeAdvance: value => latest.current.beforeAdvance(value),
      play: media => latest.current.play(media),
    });
    owner.current = { key, continuation };
    let cancelled = false;
    void continuation.next().then(next => { if (!cancelled) setSnapshot({ owner: key, next, busy: false }); });
    return () => { cancelled = true; continuation.dispose(); };
  }, [key, id, season, episode, options.native]);
  useEffect(() => {
    if (!playbackPreferences.episodePrefetch && owner.current?.key === key) owner.current.continuation.cancelPrefetch();
  }, [key, playbackPreferences.episodePrefetch]);
  useEffect(() => {
    if (playbackPreferences.episodePrefetch && shouldPrefetchEpisode(options.time, options.duration) && owner.current?.key === key) {
      void owner.current.continuation.prefetch();
    }
  }, [key, options.time, options.duration, playbackPreferences.episodePrefetch]);
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
