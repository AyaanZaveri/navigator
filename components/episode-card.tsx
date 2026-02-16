"use client";

import React from "react";
import Link from "next/link";
import { Play } from "lucide-react";
import { useMediaPlayer } from "@/contexts/MediaPlayerContext";
import type { Episode } from "@/app/actions/tv-shows";
import { buildEpisodePath } from "@/lib/series-route";

export function EpisodeCard({
  episode,
  seriesId,
}: {
  episode: Episode;
  seriesId: string;
}) {
  const { playMedia, setIsPlayerVisible } = useMediaPlayer();

  const linkHref = buildEpisodePath(seriesId, episode.season, episode.episode);
  const imageUrl = episode.thumbnail;

  const handlePlayClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    await playMedia({
      id: seriesId,
      name: episode.title || `Episode ${episode.episode}`,
      type: "series",
      mediaSourceId: episode.id,
      seriesId,
      episodeTitle: episode.title || `Episode ${episode.episode}`,
      seasonNumber: episode.season,
      episodeNumber: episode.episode,
      backdropUrl: imageUrl,
    });
    setIsPlayerVisible(true);
  };

  return (
    <div className="cursor-pointer group overflow-hidden transition select-none w-64">
      <div className="relative w-full border rounded-md overflow-hidden active:scale-[0.98] transition aspect-video">
        <Link href={linkHref} draggable={false} className="block w-full h-full">
          {imageUrl ? (
            <img
              src={imageUrl}
              className="w-full h-full object-cover transition duration-200 shadow-lg hover:brightness-85 shadow-sm group-hover:shadow-md rounded-md"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
              draggable="false"
              alt={episode.title || "Episode"}
            />
          ) : (
            <div className="w-full h-full bg-gray-800 flex items-center justify-center rounded-lg shadow-lg">
              <div className="text-white/60 text-sm">No Image</div>
            </div>
          )}
        </Link>

        {/* Play button overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all duration-300 flex items-center justify-center pointer-events-none rounded-md">
          <div className="invisible group-hover:visible transition-opacity duration-300 pointer-events-auto">
            <button
              onClick={handlePlayClick}
              className="bg-white/20 backdrop-blur-sm rounded-full p-3 hover:bg-white/30 transition active:scale-[0.97] hover:cursor-pointer"
            >
              <Play className="h-6 w-6 text-white fill-white" />
            </button>
          </div>
        </div>
      </div>
      <Link href={linkHref} draggable={false}>
        <div className="px-1">
          <div className="mt-2.5 text-sm font-medium text-foreground line-clamp-2 group-hover:underline">
            {episode.title}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            S{episode.season} &bull; E{episode.episode}
          </div>
        </div>
      </Link>
    </div>
  );
}
