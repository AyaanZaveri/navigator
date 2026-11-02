"use client";

import { useEffect, useState } from "react";
import { useSetAtom } from "jotai";
import { Vibrant } from "node-vibrant/browser";
import { AuroraBackground } from "@/components/aurora-background";
import { updateAuroraColorsAtom } from "@/lib/atoms";
import { selectAuroraColors } from "@/lib/aurora-palette";
import { artworkSampleUrl } from "@/lib/artwork";

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
  const sourceKey = JSON.stringify([backdropUrl, posterUrl]);
  const [palette, setPalette] = useState<{ sourceKey: string; colors: string[] } | null>(null);

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
          setPalette({ sourceKey, colors });
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
      // Leave this title's glow hidden instead of showing unrelated colors.
    };

    void extractColors();
    return () => { cancelled = true; };
  }, [backdropUrl, posterUrl, sourceKey, updateColors]);

  const colors = palette?.sourceKey === sourceKey ? palette.colors : undefined;
  if ((backdropUrl || posterUrl) && !colors) return null;

  return (
    <AuroraBackground
      amplitude={amplitude}
      blend={blend}
      className={className}
      colorStops={colors}
    />
  );
}

function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function buildPaletteSources(sourceUrl: string): string[] {
  const sources = [artworkSampleUrl(sourceUrl)];

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
