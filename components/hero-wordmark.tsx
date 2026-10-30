"use client";

import { useEffect, useState } from "react";
import { VibrantLogo } from "./vibrant-logo";
import { getWordmarkBounds, type WordmarkBounds } from "@/lib/wordmark-bounds";
import { cn } from "@/lib/utils";
import styles from "./hero-wordmark.module.css";

export function HeroWordmark({
  src,
  alt,
  movieName,
  className,
}: {
  src: string;
  alt: string;
  movieName: string;
  className?: string;
}) {
  const [analysis, setAnalysis] = useState<{
    src: string;
    bounds: WordmarkBounds;
    aspect: number;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      if (cancelled || !image.naturalWidth || !image.naturalHeight) return;
      const canvas = document.createElement("canvas");
      const scale = Math.min(
        1,
        160 / Math.max(image.naturalWidth, image.naturalHeight),
      );
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return;
      try {
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const bounds = getWordmarkBounds(
          context.getImageData(0, 0, canvas.width, canvas.height).data,
          canvas.width,
          canvas.height,
        );
        if (bounds)
          setAnalysis({
            src,
            bounds,
            aspect:
              (image.naturalWidth * bounds.width) /
              (image.naturalHeight * bounds.height),
          });
      } catch {
        /* Keep the original artwork if its pixels cannot be inspected. */
      }
    };
    image.src = src;
    return () => {
      cancelled = true;
      image.onload = null;
    };
  }, [src]);
  const current = analysis?.src === src ? analysis : null;
  const bounds = current?.bounds ?? { left: 0, top: 0, width: 1, height: 1 };
  const aspect = current?.aspect ?? 800 / 310;
  return (
    <div className={cn(styles.root, className)}>
      <div
        className={styles.artwork}
        style={{
          width: `min(100%, calc(var(--wordmark-max-height) * ${aspect}))`,
          aspectRatio: aspect,
        }}
      >
        <div
          className={styles.image}
          style={{
            left: `${(-bounds.left / bounds.width) * 100}%`,
            top: `${(-bounds.top / bounds.height) * 100}%`,
            width: `${100 / bounds.width}%`,
            height: `${100 / bounds.height}%`,
          }}
        >
          <VibrantLogo
            src={src}
            alt={alt}
            movieName={movieName}
            width={800}
            height={310}
            className="block size-full max-w-none object-contain"
          />
        </div>
      </div>
    </div>
  );
}
