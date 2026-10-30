"use client";

import { useState } from "react";

interface VibrantLogoProps {
  src: string;
  alt: string;
  movieName: string;
  className?: string;
  width?: number;
  height?: number;
}

export function VibrantLogo({
  src,
  alt,
  className = "max-h-20 md:max-h-24 w-auto object-contain",
  width = 300,
  height = 96,
}: VibrantLogoProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (!src || failedSrc === src) return null;

  return (
    <img
      className={className}
      src={src}
      alt={alt}
      width={width}
      height={height}
      onError={() => setFailedSrc(src)}
    />
  );
}
