"use client";

import { useRef, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useWatchStatus } from "@/contexts/watch-history-context";
import type { MediaToPlay } from "@/lib/atoms";

export function WatchToggleButton({ media }: { media: MediaToPlay }) {
    const id = media.seriesId || media.id;
    const { watched, known, toggle } = useWatchStatus(id, media.type, media.mediaSourceId);
    const intent = useRef(0);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const label = watched ? "Mark as unwatched" : "Mark as watched";

    return (
        <>
            <Tooltip delayDuration={600}>
                <TooltipTrigger asChild>
                    <Button
                        type="button"
                        variant={watched ? "default" : "secondary"}
                        size="icon-lg"
                        className={`shrink-0 rounded-full ${watched ? "bg-[color-mix(in_oklab,var(--primary)_84%,black)] text-white hover:bg-[color-mix(in_oklab,var(--primary)_78%,black)]" : ""}`}
                        aria-label={label}
                        aria-pressed={watched}
                        aria-busy={saving || !known || undefined}
                        disabled={!known}
                        onClick={async () => {
                            if (media.type !== "movie" && media.type !== "series") return;
                            const request = ++intent.current;
                            setSaving(true);
                            setError(null);
                            let saved = false;
                            try {
                                saved = await toggle(media.showName || media.name);
                            } catch { /* The shared queue restores the last confirmed state. */ }
                            if (request !== intent.current) return;
                            setSaving(false);
                            if (!saved) setError("Couldn't update watch status. Try again.");
                        }}
                    >
                        <Check aria-hidden="true" strokeWidth={2.5} className="size-4" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent sideOffset={8}>{label}</TooltipContent>
            </Tooltip>
            {error && <span role="alert" className="basis-full text-sm text-destructive">{error}</span>}
        </>
    );
}
