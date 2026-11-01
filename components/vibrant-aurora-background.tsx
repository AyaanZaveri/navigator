"use client";

import { useEffect } from "react";
import { useSetAtom } from "jotai";
import { Vibrant } from "node-vibrant/browser";
import { AuroraBackground } from "@/components/aurora-background";
import { updateAuroraColorsAtom } from "@/lib/atoms";
import { selectAuroraColors } from "@/lib/aurora-palette";

interface VibrantAuroraBackgroundProps {
  backdropUrl?: string;
  posterUrl?: string;
  className?: string;
  amplitude?: number;
  blend?: number;
}

export function VibrantAuroraBackground({
  backdropUrl,
  posterUrl,
  className = "fixed inset-0 z-0 pointer-events-none opacity-30",
  amplitude = 0.8,
  blend = 0.4,
}: VibrantAuroraBackgroundProps) {
  const updateColors = useSetAtom(updateAuroraColorsAtom);

  useEffect(() => {
    const paletteSources = Array.from(new Set(
      [backdropUrl, posterUrl].filter(isDefined).filter(Boolean).flatMap(buildPaletteSources),
    ));
    if (!paletteSources.length) return;
    let cancelled = false;

    const extractColors = async () => {
      for (const paletteSource of paletteSources) {
        if (cancelled) return;
        let timeout: ReturnType<typeof setTimeout> | undefined;
        const image = new Image();
        try {
          // Set CORS mode before loading, even for our same-origin redirects.
          // Vibrant only does this automatically for visibly cross-origin URLs.
          image.crossOrigin = "anonymous";
          image.src = paletteSource;
          const palette = await Promise.race([
            Vibrant.from(image).getPalette(),
            new Promise<never>((_, reject) => {
              timeout = setTimeout(() => reject(new Error("Palette image timed out")), 4000);
            }),
          ]);
          if (cancelled) return;
          const swatches = [
            palette.Vibrant,
            palette.LightVibrant,
            palette.DarkVibrant,
            palette.Muted,
            palette.LightMuted,
            palette.DarkMuted,
          ].filter(isDefined);

          const colors = selectAuroraColors(swatches);
          if (!colors) continue;
          updateColors(colors);
          return;
        } catch {
          continue;
        } finally {
          clearTimeout(timeout);
          image.src = "";
        }
      }

      if (cancelled) return;
      console.warn("Failed to extract aurora colors from image sources");
      // Keep previous colors on error - they're already in the atom
    };

    void extractColors();
    return () => { cancelled = true; };
  }, [backdropUrl, posterUrl, updateColors]);

  return (
    <AuroraBackground
      amplitude={amplitude}
      blend={blend}
      className={className}
    />
  );
}

function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function buildPaletteSources(sourceUrl: string): string[] {
  const sources = [sourceUrl];

  const isHttp = /^https?:\/\//i.test(sourceUrl);
  const isWeservProxy = /(?:^https?:\/\/)?wsrv\.nl/i.test(sourceUrl);
  if (isHttp && !isWeservProxy) {
    const normalized = sourceUrl.replace(/^https?:\/\//i, "");
    sources.push(
      `https://wsrv.nl/?url=${encodeURIComponent(normalized)}&w=300&h=300`
    );
  }

  return sources;
}
