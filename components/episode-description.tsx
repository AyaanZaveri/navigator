"use client";

import { useEffect, useId, useRef, useState } from "react";

export function EpisodeDescription({ text }: { text: string }) {
    const id = useId();
    const paragraph = useRef<HTMLParagraphElement>(null);
    const [expanded, setExpanded] = useState(false);
    const [overflowing, setOverflowing] = useState(false);

    useEffect(() => {
        const element = paragraph.current;
        if (!element || expanded) return;
        const measure = () => setOverflowing(element.scrollHeight > element.clientHeight + 1);
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        measure();
        return () => observer.disconnect();
    }, [expanded, text]);

    return (
        <div className="min-w-0 max-w-prose">
            <p
                ref={paragraph}
                id={id}
                className={`break-words text-base leading-relaxed${expanded ? "" : " line-clamp-3"}`}
            >
                {text}
            </p>
            {(overflowing || expanded) && (
                <button
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={id}
                    onClick={() => setExpanded(value => !value)}
                    className="mt-1 min-h-9 rounded-sm text-sm font-medium text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                >
                    {expanded ? "Show less" : "Show more"}
                </button>
            )}
        </div>
    );
}
