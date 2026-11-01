"use client";

import { useState } from "react";
import { previewContentBounds } from "@/lib/media/preview-content";

type Crop = { source: string; ratio: number; left: number; top: number; width: number; height: number };

// Revisited thumbnails should not run canvas readback/content analysis again.
const crops = new Map<string, Crop>();

/** Preserve the content's aspect ratio, including letterbox bands encoded in the frame. */
export function PreviewImage({ src, alt = "" }: { src: string; alt?: string }) {
    const [crop, setCrop] = useState<Crop | null>(null);
    // Retain the last ratio while the next frame loads to avoid a 16:9 flash.
    const current = crop?.source === src ? crop : crops.get(src) ?? null;
    return (
        <div className="relative w-56 overflow-hidden rounded-lg" style={{ aspectRatio: current?.ratio ?? crop?.ratio ?? 16 / 9 }}>
            <img
                src={src} alt={alt} draggable={false}
                className="absolute max-w-none"
                style={{ left: `${current?.left ?? 0}%`, top: `${current?.top ?? 0}%`, width: `${current?.width ?? 100}%`, height: `${current?.height ?? 100}%`, visibility: current ? "visible" : "hidden" }}
                onLoad={event => {
                    const cached = crops.get(src);
                    if (cached) { setCrop(cached); return; }
                    const image = event.currentTarget;
                    const width = image.naturalWidth, height = image.naturalHeight;
                    if (!width || !height) return;
                    let next: Crop = { source: src, ratio: width / height, left: 0, top: 0, width: 100, height: 100 };
                    try {
                        const canvas = document.createElement("canvas");
                        const scale = Math.min(448 / width, 1);
                        canvas.width = Math.max(1, Math.round(width * scale));
                        canvas.height = Math.max(1, Math.round(height * scale));
                        const context = canvas.getContext("2d", { willReadFrequently: true });
                        if (context) {
                            context.drawImage(image, 0, 0, canvas.width, canvas.height);
                            const bounds = previewContentBounds(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
                            next = { source: src, ratio: bounds.width / bounds.height,
                                left: -bounds.x / bounds.width * 100, top: -bounds.y / bounds.height * 100,
                                width: canvas.width / bounds.width * 100, height: canvas.height / bounds.height * 100 };
                        }
                    } catch { /* Cross-origin frames still retain their intrinsic aspect ratio. */ }
                    crops.set(src, next);
                    while (crops.size > 96) crops.delete(crops.keys().next().value!);
                    setCrop(next);
                }}
            />
        </div>
    );
}
