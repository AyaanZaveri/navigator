"use client";

import { useEffect, type RefObject } from "react";
import { attachBrowserPlayerGlass } from "@/lib/media/browser-player-glass";

export function BrowserPlayerGlass({ mediaRef, sourceKey, ready }: {
    mediaRef: RefObject<HTMLVideoElement | null>; sourceKey: string; ready: boolean;
}) {
    useEffect(() => {
        if (ready && mediaRef.current) return attachBrowserPlayerGlass(mediaRef.current);
    }, [mediaRef, sourceKey, ready]);
    return null;
}
