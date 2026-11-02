"use client";

import { ArtworkImage } from "@/components/artwork-image";

import { preloadPlayer } from "@/lib/preload-tools";

import React, { useState } from "react";
import { mediaArtwork, backdropVariantUrl } from "@/lib/artwork";
import Link from "next/link";
import type { MediaItem } from "@/types/stremio";
import { Play } from "lucide-react";
import { usePlaybackActions } from "@/contexts/MediaPlayerContext";
import { buildEpisodePath } from "@/lib/series-route";
import styles from "./media-card.module.css";
import { WatchedIndicator } from "@/components/watched-indicator";

export function MediaCard({
  item,
  continueWatching = false,
  fullWidth = false,
  subtitleContent,
}: {
  item: MediaItem;
  continueWatching?: boolean;
  fullWidth?: boolean;
  subtitleContent?: React.ReactNode;
}) {
  const { playMedia, setIsPlayerVisible } = usePlaybackActions();

  let linkHref = "";
  if (
    continueWatching &&
    item.type === "series" &&
    typeof item.seasonNumber === "number" &&
    typeof item.episodeNumber === "number"
  ) {
    linkHref = buildEpisodePath(item.id, item.seasonNumber, item.episodeNumber);
  } else if (item.type === "movie") {
    linkHref = `/movie/${item.id}`;
  } else if (item.type === "series") {
    linkHref = `/series/${item.id}`;
  } else {
    linkHref = `/movie/${item.id}`;
  }

  const artwork = mediaArtwork(item.seriesId || item.id, item.type);
  const imageUrl = continueWatching ? backdropVariantUrl(artwork.background, 780) : artwork.poster;
  const imageSrcSet = continueWatching && artwork.background
    ? ([300, 780, 1280] as const).map(width => `${backdropVariantUrl(artwork.background, width)} ${width}w`).join(", ") : undefined;
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const [failedLogo, setFailedLogo] = useState<string | null>(null);
  const [pressed, setPressed] = useState(false);
  const subtitle = continueWatching
    ? item.progressLabel ||
      (item.type === "movie"
        ? (typeof item.year === "number" && item.year >= 1888
            ? item.year.toString()
            : item.releaseInfo || "")
        : item.releaseInfo || "")
    : (typeof item.year === "number" && item.year >= 1888
        ? item.year.toString()
        : item.releaseInfo || "");

  const handlePlayClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (item) {
      await playMedia({
        detailsPath: linkHref,
        animateEntrance: e.detail > 0,
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
        backdropUrl: artwork.background || artwork.poster,
        subtitleFilename: item.subtitleFilename,
        subtitleVideoSize: item.subtitleVideoSize,
      });
      setIsPlayerVisible(true);
    }
  };

  return (
    <div
      data-continue-watching={continueWatching || undefined}
      className={`${styles.card} cursor-pointer select-none ${
        continueWatching ? "w-80" : fullWidth ? "w-full" : "w-36"
      }`}
    >
      <div
        className={`${styles.frame} relative w-full border overflow-hidden ${
          continueWatching ? "aspect-video" : "aspect-[2/3]"
        }`}
        data-pressed={pressed || undefined}
        onPointerDown={(event) => {
          if (event.button === 0) setPressed(true);
        }}
        onPointerUp={() => setPressed(false)}
        onPointerLeave={() => setPressed(false)}
        onPointerCancel={() => setPressed(false)}
      >
        {/* Definite link bounds avoid WebKit resolving nested 100% image heights against the page. */}
        <Link href={linkHref} prefetch={true} draggable={false} className="absolute inset-0">
          {imageUrl && failedImage !== imageUrl ? (
            <ArtworkImage
              src={imageUrl}
              srcSet={imageSrcSet}
              sizes={continueWatching ? "320px" : undefined}
              width={continueWatching ? 320 : 144}
              height={continueWatching ? 180 : 216}
              loading="lazy"
              data-prefetch-artwork={continueWatching ? "" : undefined}
              onError={() => setFailedImage(imageUrl)}
              alt={item.name || ""}
              className={`${styles.artwork} block w-full h-full object-cover`}
              draggable={false}
            />
          ) : (
            <div className="w-full h-full bg-gray-800 flex items-center justify-center">
              <div className="text-white/60 text-sm">No Image</div>
            </div>
          )}
        </Link>

        {/* Play button overlay */}
        <div className={`${styles.playOverlay} absolute inset-0 z-30 flex items-center justify-center`}>
          <button
            type="button"
            aria-label={`Play ${item.episodeTitle || item.name}`}
            onClick={handlePlayClick}
            onPointerEnter={preloadPlayer}
            onFocus={preloadPlayer}
            className={`${styles.playButton} relative z-40 rounded-full p-3 backdrop-blur-md`}
          >
            <Play className="h-6 w-6 text-white fill-white" />
          </button>
        </div>

        <WatchedIndicator
          id={item.seriesId || item.id}
          type={item.type}
          videoId={item.mediaSourceId || item.episodeId || (item.type === "series" && item.seasonNumber !== undefined && item.episodeNumber !== undefined
            ? `${item.seriesId || item.id}:${item.seasonNumber}:${item.episodeNumber}` : undefined)}
          aboveProgress={continueWatching && typeof item.progressPercent === "number"}
        />

        {continueWatching && typeof item.progressPercent === "number" ? (
          // Keep playback status above the hover scrim, like the watched indicator.
          <div className="absolute inset-x-2 bottom-2 z-40 h-1.5 rounded-full bg-white/30 backdrop-blur-sm overflow-hidden pointer-events-none">
            <div
              className="h-full rounded-full bg-white/80"
              style={{ width: `${item.progressPercent}%` }}
            />
          </div>
        ) : null}

        {continueWatching && artwork.logo && failedLogo !== artwork.logo ? (
          <div className={`${styles.wordmark} absolute inset-0 z-25 pointer-events-none flex items-center justify-center px-6`}>
            <img
              src={artwork.logo}
              loading="lazy"
              decoding="async"
              fetchPriority="low"
              onError={() => setFailedLogo(artwork.logo!)}
              alt={`${item.name} logo`}
              className="max-h-[36%] max-w-[78%] w-auto object-contain drop-shadow-[0_4px_14px_rgba(0,0,0,0.95)]"
              draggable={false}
            />
          </div>
        ) : null}
      </div>
      <Link href={linkHref} prefetch={true} draggable={false}>
        <div className="px-1">
          <div className="mt-2.5 text-sm font-medium text-foreground truncate">
            {item.name}
          </div>
          <div className={`text-xs text-muted-foreground mt-0.5 ${continueWatching ? "min-h-4" : ""}`}>
            {subtitleContent ?? subtitle}
          </div>
        </div>
      </Link>
    </div>
  );
}
