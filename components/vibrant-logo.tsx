"use client";

import { useEffect, useState } from "react";
import { isDarkWordmark } from "@/lib/logo-contrast";

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
    const [analysis, setAnalysis] = useState<{ src: string; dark: boolean } | null>(null);

    useEffect(() => {
        let cancelled = false;
        // Analyze a separate image so a missing CORS header never breaks the
        // displayed artwork. If analysis fails, preserve the original logo.
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.onload = () => {
            if (cancelled) return;
            const canvas = document.createElement("canvas");
            const scale = Math.min(1, 160 / Math.max(image.naturalWidth, image.naturalHeight));
            canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
            canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
            const context = canvas.getContext("2d", { willReadFrequently: true });
            if (!context) return;
            try {
                context.drawImage(image, 0, 0, canvas.width, canvas.height);
                const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
                setAnalysis({ src, dark: isDarkWordmark(pixels) });
            } catch {
                // Keep the supplied artwork when pixels cannot be inspected.
            }
        };
        image.src = src;
        return () => {
            cancelled = true;
            image.onload = null;
        };
    }, [src]);

    const lighten = analysis?.src === src && analysis.dark;

    return (
        <img
            className={className}
            src={src}
            alt={alt}
            width={width}
            height={height}
            style={lighten ? {
                filter: "brightness(0) invert(1) drop-shadow(0 2px 8px rgb(0 0 0 / 0.5))",
            } : undefined}
        />
    );
}
