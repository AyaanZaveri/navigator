"use client";

import { useEffect } from "react";
import { useAtom, useSetAtom } from "jotai";
import { Vibrant } from "node-vibrant/browser";
import { AuroraBackground } from "@/components/aurora-background";
import { auroraColorsAtom, updateAuroraColorsAtom } from "@/lib/atoms";

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
  const [colorStops] = useAtom(auroraColorsAtom);
  const updateColors = useSetAtom(updateAuroraColorsAtom);

  useEffect(() => {
    const sourceUrl = backdropUrl || posterUrl;
    if (!sourceUrl) return;

    const extractColors = async () => {
      const paletteSources = buildPaletteSources(sourceUrl);

      for (const paletteSource of paletteSources) {
        try {
          const palette = await Vibrant.from(paletteSource).getPalette();
          const swatches = [
            palette.Vibrant,
            palette.LightVibrant,
            palette.DarkVibrant,
            palette.Muted,
            palette.LightMuted,
            palette.DarkMuted,
          ].filter(isDefined);

          const uniqueSwatches = Array.from(
            new Map(swatches.map((swatch) => [swatch.hex, swatch])).values()
          );
          const uniqueHex = uniqueSwatches.map((swatch) => swatch.hex);
          if (uniqueHex.length < 2) {
            continue;
          }

          // Prioritize majority colors by swatch population.
          const ranked = [...uniqueSwatches]
            .sort((a, b) => (b.population || 0) - (a.population || 0))
            .map((swatch) => swatch.hex);

          const primary = ranked[0];
          const secondary = ranked[1];
          const tertiary = ranked[2] ?? primary;
          const quaternary = ranked[3];
          const finalColors = quaternary
            ? [primary, secondary, tertiary, quaternary]
            : [primary, secondary, tertiary];

          updateColors(finalColors);
          return;
        } catch {
          continue;
        }
      }

      console.warn("Failed to extract aurora colors from image sources");
      // Keep previous colors on error - they're already in the atom
    };

    extractColors();
  }, [backdropUrl, posterUrl, updateColors]);

  return (
    <AuroraBackground
      colorStops={colorStops}
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
