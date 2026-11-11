"use client";

import { useCallback, useRef, useState } from "react";
import type { MediaItem } from "@/types/stremio";
import { useBackdropOverscroll } from "./use-backdrop-overscroll";
import artworkStyles from "../artwork-image.module.css";

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
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const attach = useCallback((image: HTMLImageElement | null) => {
    imageRef.current = image;
    if (image?.complete && image.naturalWidth > 0) setLoadedSrc(backdropImage);
  }, [backdropImage]);
  useBackdropOverscroll(imageRef, failedSrc === backdropImage ? "" : backdropImage);
  const mediaName = name ?? movie?.name ?? "Media";

  if (!backdropImage || failedSrc === backdropImage) {
    return <div aria-hidden="true" className={`${className} bg-background`} />;
  }

  return (
    <img
      ref={attach}
      draggable={false}
      data-header-backdrop
      className={`${className} ${loadedSrc === backdropImage ? artworkStyles.reveal : artworkStyles.pending}`}
      src={backdropImage}
      alt={`${mediaName} backdrop`}
      width={width}
      height={height}
      fetchPriority="high"
      decoding="async"
      onLoad={() => setLoadedSrc(backdropImage)}
      onError={() => setFailedSrc(backdropImage)}
    />
  );
}
