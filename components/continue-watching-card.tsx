"use client";

import React from "react";
import type { MediaItem } from "@/types/stremio";
import { useMediaPlayer } from "@/contexts/MediaPlayerContext";

interface ContinueWatchingCardProps {
  item: MediaItem;
}

export function ContinueWatchingCard({ item }: ContinueWatchingCardProps) {
  const { playMedia, setIsPlayerVisible } = useMediaPlayer();

  const imageUrl = item.background || item.poster;

  const handlePlayResume = async () => {
    await playMedia({
      id: item.id,
      name: item.episodeTitle || item.name,
      type: item.type,
      resumePositionTicks: item.resumePositionTicks,
      streamUrl: item.streamUrl,
      mediaSourceId: item.mediaSourceId,
      seriesId: item.type === "series" ? item.seriesId || item.id : undefined,
      showName: item.type === "series" ? item.showName || item.name : undefined,
      episodeTitle:
        item.type === "series" ? item.episodeTitle : undefined,
      seasonNumber: item.seasonNumber,
      episodeNumber: item.episodeNumber,
      backdropUrl: item.background || item.poster,
      subtitleFilename: item.subtitleFilename,
      subtitleVideoSize: item.subtitleVideoSize,
    });
    setIsPlayerVisible(true);
  };

  return (
    <div
      onClick={handlePlayResume}
      className="cursor-pointer group overflow-hidden transition select-none w-64"
    >
      <div className="relative w-full aspect-video">
        {imageUrl ? (
          <img
            src={imageUrl}
            className="w-full h-full object-cover transition duration-200 shadow-lg hover:brightness-85 rounded-md border shadow-sm group-hover:shadow-md active:scale-[0.98]"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
            draggable="false"
          />
        ) : (
          <div className="w-full h-full bg-gray-800 flex items-center justify-center rounded-lg shadow-lg">
            <div className="text-white/60 text-sm">No Image</div>
          </div>
        )}
      </div>

      <div className="px-1">
        <div className="mt-2.5 text-sm font-medium text-foreground truncate group-hover:underline">
          {item.name}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {item.year || item.releaseInfo || ""}
        </div>
      </div>
    </div>
  );
}
