"use client";

import React, { useState } from "react";
import Link from "next/link";
import type { MediaItem } from "@/types/stremio";
import { Play } from "lucide-react";
import { useMediaPlayer } from "@/contexts/MediaPlayerContext";

export function MediaCard({
  item,
  continueWatching = false,
  fullWidth = false,
}: {
  item: MediaItem;
  continueWatching?: boolean;
  fullWidth?: boolean;
}) {
  const { playMedia, setIsPlayerVisible } = useMediaPlayer();
  const [imageLoaded, setImageLoaded] = useState(false);

  let linkHref = "";
  if (item.type === "movie") {
    linkHref = `/movie/${item.id}`;
  } else if (item.type === "series") {
    linkHref = `/series/${item.id}`;
  } else {
    linkHref = `/movie/${item.id}`;
  }

  const imageUrl = continueWatching
    ? item.background || item.poster
    : item.poster;
  const subtitle = continueWatching
    ? item.progressLabel || item.releaseInfo || ""
    : item.year || item.releaseInfo || "";

  const handlePlayClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (item) {
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
          item.type === "series" ? item.episodeTitle || item.name : undefined,
        seasonNumber: item.seasonNumber,
        episodeNumber: item.episodeNumber,
        backdropUrl: item.background || item.poster,
        subtitleFilename: item.subtitleFilename,
        subtitleVideoSize: item.subtitleVideoSize,
      });
      setIsPlayerVisible(true);
    }
  };

  return (
    <div
      className={`cursor-pointer group overflow-hidden transition select-none ${
        continueWatching ? "w-80" : fullWidth ? "w-full" : "w-36"
      }`}
    >
      <div
        className={`relative w-full border rounded-md overflow-hidden active:scale-[0.98] transition ${
          continueWatching ? "aspect-video" : "aspect-[2/3]"
        }`}
      >
        <Link href={linkHref} draggable={false} className="block w-full h-full">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={item.name || ""}
              className="w-full h-full object-cover transition-opacity duration-300 shadow-lg shadow-sm group-hover:shadow-md rounded-md opacity-100"
              onLoad={() => setImageLoaded(true)}
              draggable={false}
              ref={(img) => {
                if (img && img.complete && img.naturalHeight !== 0) {
                  setImageLoaded(true);
                }
              }}
            />
          ) : (
            <div className="w-full h-full bg-gray-800 flex items-center justify-center rounded-lg shadow-lg">
              <div className="text-white/60 text-sm">No Image</div>
            </div>
          )}
        </Link>

        {continueWatching ? (
          <div className="absolute inset-0 z-10 bg-black/35 pointer-events-none" />
        ) : null}

        {/* Play button overlay */}
        <div className="absolute inset-0 z-30 bg-black/0 group-hover:bg-black/25 transition-all duration-300 flex items-center justify-center pointer-events-none rounded-md">
          <div className="invisible group-hover:visible transition-opacity duration-300 pointer-events-auto">
            <button
              onClick={handlePlayClick}
              className="relative z-40 bg-white/20 backdrop-blur-sm rounded-full p-3 hover:bg-white/30 transition active:scale-[0.97] hover:cursor-pointer"
            >
              <Play className="h-6 w-6 text-white fill-white" />
            </button>
          </div>
        </div>

        {continueWatching && typeof item.progressPercent === "number" ? (
          <div className="absolute inset-x-2 bottom-2 z-20 h-1.5 rounded-full bg-white/30 backdrop-blur-sm overflow-hidden pointer-events-none">
            <div
              className="h-full rounded-full bg-white transition-all"
              style={{ width: `${item.progressPercent}%` }}
            />
          </div>
        ) : null}

        {continueWatching && item.logo ? (
          <div className="absolute inset-0 z-25 pointer-events-none flex items-center justify-center px-6">
            <img
              src={item.logo}
              alt={`${item.name} logo`}
              className="max-h-[36%] max-w-[78%] w-auto object-contain drop-shadow-[0_4px_14px_rgba(0,0,0,0.95)]"
              draggable={false}
            />
          </div>
        ) : null}
      </div>
      <Link href={linkHref} draggable={false}>
        <div className="px-1">
          <div className="mt-2.5 text-sm font-medium text-foreground truncate group-hover:underline">
            {item.name}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {subtitle}
          </div>
        </div>
      </Link>
    </div>
  );
}
