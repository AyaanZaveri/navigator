"use client";

import React, { useState } from "react";
import type { MediaItem } from "@/types/stremio";

interface BackdropImageProps {
  name?: string;
  movie?: Pick<MediaItem, "name">;
  backdropImage: string;
  className?: string;
  width?: number;
  height?: number;
}

export function BackdropImage({
  name,
  movie,
  backdropImage,
  className = "w-full h-full object-cover",
  width = 1920,
  height = 1080,
}: BackdropImageProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const mediaName = name ?? movie?.name ?? "Media";

  return (
    <>
      {!imageLoaded && (
        <div className={`${className} absolute inset-0 bg-gray-800`} />
      )}

      <img
        className={`${className} transition-opacity duration-300 ${
          imageLoaded ? "opacity-100" : "opacity-0"
        }`}
        src={backdropImage}
        alt={`${mediaName} backdrop`}
        width={width}
        height={height}
        onLoad={() => setImageLoaded(true)}
        onError={() => console.error("Failed to load backdrop image")}
        ref={(img) => {
          if (img && img.complete && img.naturalHeight !== 0) {
            setImageLoaded(true);
          }
        }}
      />
    </>
  );
}
