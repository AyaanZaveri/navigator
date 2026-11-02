"use client";

import { useEffect, useState } from "react";
import { SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MediaPlayerTooltip } from "@/components/ui/media-player";
import { getFollowingEpisodeForSeries, type Episode } from "@/app/actions/tv-shows";
import { usePlaybackActions } from "@/contexts/MediaPlayerContext";
import type { MediaToPlay } from "@/lib/atoms";

export function PlayerNextEpisode({ media, season, episode, onAdvance }: {
    media: MediaToPlay;
    season: number;
    episode: number;
    onAdvance: () => void;
}) {
    const { playMedia } = usePlaybackActions();
    const [next, setNext] = useState<Episode | null>(null);
    const [advancing, setAdvancing] = useState(false);
    const id = media.seriesId || media.id;
    useEffect(() => {
        let cancelled = false;
        void getFollowingEpisodeForSeries(id, season, episode)
            .then(result => { if (!cancelled) setNext(result); })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [id, season, episode]);
    if (!next) return null;
    return (
        <MediaPlayerTooltip tooltip={`Next episode · S${next.season} E${next.episode}`}>
            <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Play next episode: ${next.title}`}
                disabled={advancing}
                onClick={() => {
                    setAdvancing(true);
                    onAdvance();
                    void playMedia({
                        id, seriesId: id, type: "series", name: next.title,
                        showName: media.showName,
                        mediaSourceId: next.id, episodeTitle: next.title,
                        seasonNumber: next.season, episodeNumber: next.episode,
                        backdropUrl: media.backdropUrl,
                    });
                }}
            >
                <SkipForward />
            </Button>
        </MediaPlayerTooltip>
    );
}
