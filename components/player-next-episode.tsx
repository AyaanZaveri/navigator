"use client";

import { SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MediaPlayerTooltip } from "@/components/ui/media-player";
import type { Episode } from "@/app/actions/tv-shows";

export function PlayerNextEpisode({ next, advancing, onAdvance }: {
    next: Episode | null; advancing: boolean; onAdvance(): void;
}) {
    if (!next) return null;
    return <MediaPlayerTooltip tooltip={`Next episode · S${next.season} E${next.episode}`}>
        <Button type="button" variant="ghost" size="sm" className="h-8"
            aria-label={`Play next episode: ${next.title}`} disabled={advancing} onClick={onAdvance}>
            <SkipForward />{advancing ? "Opening episode…" : "Next episode"}
        </Button>
    </MediaPlayerTooltip>;
}
