"use client";

import React, { useState } from "react";
import type { MediaItem } from "@/types/stremio";

interface PosterImageProps {
  name?: string;
  movie?: Pick<MediaItem, "name">;
  posterImage: string;
  className?: string;
  width?: number;
  height?: number;
}

export function PosterImage({
  name,
  movie,
  posterImage,
  className = "w-full h-auto rounded-lg shadow-2xl",
  width = 500,
  height = 750,
}: PosterImageProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const mediaName = name ?? movie?.name ?? "Media";
  const resolvedPosterImage = posterImage.includes("/poster/small/")
    ? posterImage.replace("/poster/small/", "/poster/large/")
    : posterImage;

  return (
    <>
      {!imageLoaded && (
        <div
          className={`${className} bg-gray-800`}
          style={{ aspectRatio: `${width} / ${height}` }}
        />
      )}

      <img
        className={`${className} transition-opacity duration-300 ${
          imageLoaded ? "opacity-100" : "opacity-0"
        } ${!imageLoaded ? "absolute top-0 left-0" : ""}`}
        src={resolvedPosterImage}
        alt={`${mediaName} poster`}
        width={width}
        height={height}
        onLoad={() => setImageLoaded(true)}
        onError={() => console.error("Failed to load poster image")}
        ref={(img) => {
          if (img && img.complete && img.naturalHeight !== 0) {
            setImageLoaded(true);
          }
        }}
      />
    </>
  );
}
