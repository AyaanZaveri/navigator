"use client";

import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMediaPlayer, type MediaToPlay } from "@/contexts/MediaPlayerContext";

export function MediaPlayButton({ media }: { media: MediaToPlay }) {
    const { playMedia } = useMediaPlayer();

    return (
        <Button
            type="button"
            variant="default"
            size="lg"
            className="mt-3 gap-2 rounded-full bg-foreground px-5 text-[15px] font-semibold text-background has-[>svg]:px-5 hover:bg-foreground/90 hover:ring-2 hover:ring-offset-2 hover:ring-primary hover:ring-offset-accent hover:shadow-xl hover:shadow-primary/30"
            aria-label={`Play ${media.name}`}
            onClick={() => playMedia(media)}
        >
            <Play aria-hidden="true" data-icon="inline-start" className="size-4 fill-current" />
            Play
        </Button>
    );
}
