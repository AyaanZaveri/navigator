"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useWatchStatus } from "@/contexts/watch-history-context";
import { setWatchedStatus } from "@/app/actions/watch-history";
import { WATCH_HISTORY_CHANGED } from "@/lib/watch-history";
import type { MediaToPlay } from "@/lib/atoms";

export function WatchToggleButton({ media }: { media: MediaToPlay }) {
    const id = media.seriesId || media.id;
    const { watched, known, update } = useWatchStatus(id, media.type, media.mediaSourceId);
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
                        disabled={saving || !known}
                        onClick={async () => {
                            if (media.type !== "movie" && media.type !== "series") return;
                            setSaving(true);
                            setError(null);
                            try {
                                const result = await setWatchedStatus({
                                    id, type: media.type, name: media.showName || media.name,
                                    videoId: media.mediaSourceId, watched: !watched,
                                });
                                if (!result) throw new Error("Watch status update failed");
                                update(result);
                                window.dispatchEvent(new CustomEvent(WATCH_HISTORY_CHANGED, { detail: { id } }));
                            } catch {
                                setError("Couldn't update watch status. Try again.");
                            } finally {
                                setSaving(false);
                            }
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
