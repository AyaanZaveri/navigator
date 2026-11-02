"use client";

import { useState } from "react";
import { artworkSampleUrl } from "@/lib/artwork";
import styles from "./player-loading-wordmark.module.css";

export function PlayerLoadingWordmark({ src, alt, loading }: {
    src: string;
    alt: string;
    loading: boolean;
}) {
    const [failedSrc, setFailedSrc] = useState<string | null>(null);
    // Masks need same-origin image bytes, including when the CDN redirects.
    const maskSrc = artworkSampleUrl(src);
    if (failedSrc === src) return null;

    const maskImage = `url(${JSON.stringify(maskSrc)})`;

    return (
        <div className={styles.root}>
            <div className={styles.logo} data-loading={loading || undefined}>
                <img
                    src={src}
                    fetchPriority="high"
                    decoding="async"
                    alt={alt}
                    draggable={false}
                    className={styles.image}
                    onError={() => setFailedSrc(src)}
                />
                {loading && (
                    <span
                        aria-hidden="true"
                        className={styles.mask}
                        style={{ maskImage, WebkitMaskImage: maskImage }}
                    >
                        <span className={styles.sheen} />
                    </span>
                )}
            </div>
        </div>
    );
}
