"use client";

import { useEffect, useState, type RefObject } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { FastForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resolveSkipIMDbId } from "@/app/actions/skip-segments";
import { activeSkipSegment, fetchSkipSegments, type SkipSegment, type SkipLookup } from "@/lib/media/skip-segments";

const labels = { intro: "Skip Intro", recap: "Skip Recap", credits: "Skip Credits" };

export function PlayerSkipSegments({ lookup, currentTime, mediaRef, onSeek }: {
    lookup: SkipLookup;
    currentTime: number;
    mediaRef: RefObject<HTMLVideoElement | null>;
    onSeek: (_time: number) => void;
}) {
    const [segments, setSegments] = useState<SkipSegment[]>([]);
    const reduceMotion = useReducedMotion();
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
    const closedTransform = reduceMotion ? "none" : "translateY(20px) scale(0.8)";
    return (
        <AnimatePresence>
            {segment && (
                <motion.div
                    key={`${segment.kind}:${segment.start}:${segment.end}`}
                    initial={{ opacity: 0, transform: closedTransform }}
                    animate={{ opacity: 1, transform: "translateY(0px) scale(1)" }}
                    exit={{ opacity: 0, transform: closedTransform }}
                    transition={reduceMotion ? { duration: 0.15 } : { type: "spring", damping: 20, stiffness: 100 }}
                    data-player-skip=""
                    className="fixed right-[max(1.5rem,env(safe-area-inset-right))] z-30 rounded-lg backdrop-blur-md"
                >
                    <Button
                        type="button"
                        onClick={event => {
                            event.stopPropagation();
                            if (!mediaRef.current) return;
                            mediaRef.current.currentTime = segment.end;
                            onSeek(segment.end);
                        }}
                        className="text-white text-center bg-black/30 rounded-lg text-lg py-6 px-6! font-medium shadow-xl hover:bg-black/40 transition-colors motion-reduce:transform-none"
                    >
                        <FastForward className="w-4 h-4 fill-white scale-110 mr-1.5" />
                        {labels[segment.kind]}
                    </Button>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
