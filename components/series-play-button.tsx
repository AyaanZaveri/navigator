"use client";

import React, { useState, useEffect } from "react";
import type { MediaItem } from "@/types/stremio";
import { Button } from "@/components/ui/button";
import { Play, Loader2 } from "lucide-react";
import { getNextEpisodeForSeries } from "@/app/actions/tv-shows";
import { useMediaPlayer } from "@/contexts/MediaPlayerContext";
import type { Episode } from "@/app/actions/tv-shows";

interface SeriesPlayButtonProps {
  series: MediaItem;
}

export function SeriesPlayButton({ series }: SeriesPlayButtonProps) {
  const [nextEpisode, setNextEpisode] = useState<Episode | null>(null);
  const [loading, setLoading] = useState(true);
  const { playMedia, setIsPlayerVisible } = useMediaPlayer();

  useEffect(() => {
    async function fetchNextEpisode() {
      if (!series.id) return;

      setLoading(true);
      try {
        const episode = await getNextEpisodeForSeries(series.id);
        setNextEpisode(episode);
      } catch (error) {
        console.error("Failed to fetch next episode:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchNextEpisode();
  }, [series.id]);

  const handlePlay = async () => {
    if (!nextEpisode) return;

    try {
      await playMedia({
        id: series.id,
        name: nextEpisode.title || `Episode ${nextEpisode.episode}`,
        type: "series",
        mediaSourceId: nextEpisode.id,
        seriesId: series.id,
        showName: series.name,
        episodeTitle: nextEpisode.title || `Episode ${nextEpisode.episode}`,
        seasonNumber: nextEpisode.season,
        episodeNumber: nextEpisode.episode,
        backdropUrl: series.background || series.poster,
      });
      setIsPlayerVisible(true);
    } catch (error) {
      console.error("Failed to play episode:", error);
    }
  };

  if (loading) {
    return (
      <Button variant="default" disabled size="lg">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading...
      </Button>
    );
  }

  if (!nextEpisode) return null;

  return (
    <Button variant="default" onClick={handlePlay} className="gap-2" size="lg">
      <Play className="h-4 w-4" />
      Play
      <span className="hidden sm:inline text-sm opacity-75">
        S{nextEpisode.season} &bull; E{nextEpisode.episode}
      </span>
    </Button>
  );
}
