"use client";

import { useEffect, useMemo, useState, type RefObject } from "react";
import { chapterCues, readEmbeddedChapters, type ChapterMarker } from "@/lib/media/chapters";
import type { MpvElementHandle } from "@/lib/desktop/mpv-element";

export function usePlayerChapters(mediaRef: RefObject<HTMLVideoElement | null>, source: string | null, duration: number) {
    const [result, setResult] = useState<{ source: string; markers: ChapterMarker[] } | null>(null);
    useEffect(() => {
        if (!source || duration <= 0) return;
        const node = mediaRef.current as unknown as MpvElementHandle | null;
        const controller = node?.controller;
        let active = true;
        const update = () => { if (active) setResult({ source, markers: controller?.chapters ?? [] }); };
        node?.addEventListener("chapterschange", update);
        node?.addEventListener("emptied", update);
        if (controller?.chapters.length) update();
        // Native mpv already demuxes all supported containers. Browser/older
        // mobile runtimes can read simple MKV chapters without decoding video.
        const abort = new AbortController();
        const timer = setTimeout(() => abort.abort(), 10_000);
        if (!window.navigatorDesktop?.capabilities?.chapters) {
            void readEmbeddedChapters(source, abort.signal).then(markers => {
                if (active && !abort.signal.aborted && !controller?.chapters.length) setResult({ source, markers });
            }).catch(() => { /* CORS, non-MKV and unseekable sources keep a continuous bar. */ });
        }
        return () => {
            active = false; abort.abort(); clearTimeout(timer);
            node?.removeEventListener("chapterschange", update);
            node?.removeEventListener("emptied", update);
        };
    }, [mediaRef, source, duration]);
    return useMemo(() => chapterCues(result?.source === source ? result.markers : [], duration), [result, source, duration]);
}
