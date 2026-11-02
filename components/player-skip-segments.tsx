"use client";

import { useEffect, useState, type RefObject } from "react";
import { FastForward } from "lucide-react";
import { resolveSkipIMDbId } from "@/app/actions/skip-segments";
import { activeSkipSegment, fetchSkipSegments, type SkipSegment, type SkipLookup } from "@/lib/media/skip-segments";
import styles from "./player-skip-segments.module.css";

const labels = { intro: "Skip Intro", recap: "Skip Recap", credits: "Skip Credits" };

export function PlayerSkipSegments({ lookup, currentTime, mediaRef, onSeek }: {
    lookup: SkipLookup;
    currentTime: number;
    mediaRef: RefObject<HTMLVideoElement | null>;
    onSeek: (_time: number) => void;
}) {
    const [segments, setSegments] = useState<SkipSegment[]>([]);
    const { id, type, season, episode, duration } = lookup;
    useEffect(() => {
        const root = mediaRef.current?.closest<HTMLElement>('[data-slot="media-player"]');
        const controls = root?.querySelector<HTMLElement>('[data-slot="media-player-controls"]');
        if (!root || !controls) return;
        const update = () => root.style.setProperty("--player-controls-height", `${controls.getBoundingClientRect().height}px`);
        const observer = new ResizeObserver(update);
        observer.observe(controls);
        update();
        return () => { observer.disconnect(); root.style.removeProperty("--player-controls-height"); };
    }, [mediaRef]);
    useEffect(() => {
        const controller = new AbortController();
        void fetchSkipSegments({ id, type, season, episode, duration }, controller.signal, resolveSkipIMDbId)
            .then(result => { if (!controller.signal.aborted) setSegments(result); });
        return () => controller.abort();
    }, [id, type, season, episode, duration]);

    const segment = activeSkipSegment(segments, currentTime);
    return (
        <>
            {(Object.keys(labels) as Array<SkipSegment["kind"]>).map(kind => {
                const visible = segment?.kind === kind;
                return <button
                    key={kind}
                    type="button"
                    data-player-skip=""
                    data-visible={visible ? "" : undefined}
                    aria-hidden={!visible}
                    tabIndex={visible ? 0 : -1}
                    disabled={!visible}
                    className={styles.button}
                    onClick={event => {
                        event.stopPropagation();
                        if (!segment || !mediaRef.current) return;
                        mediaRef.current.currentTime = segment.end;
                        onSeek(segment.end);
                    }}
                >
                    <FastForward aria-hidden="true" className="size-4 fill-current" />
                    {labels[kind]}
                </button>;
            })}
        </>
    );
}
