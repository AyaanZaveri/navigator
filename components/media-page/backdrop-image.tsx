"use client";

import { useRef, useState } from "react";
import type { MediaItem } from "@/types/stremio";
import { useBackdropOverscroll } from "./use-backdrop-overscroll";

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
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  useBackdropOverscroll(imageRef, failedSrc === backdropImage ? "" : backdropImage);
  const mediaName = name ?? movie?.name ?? "Media";

  if (!backdropImage || failedSrc === backdropImage) {
    return <div aria-hidden="true" className={`${className} bg-background`} />;
  }

  return (
    <img
      ref={imageRef}
      draggable={false}
      data-header-backdrop
      className={className}
      src={backdropImage}
      alt={`${mediaName} backdrop`}
      width={width}
      height={height}
      fetchPriority="high"
      decoding="async"
      onError={() => setFailedSrc(backdropImage)}
    />
  );
}
