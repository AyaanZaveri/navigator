"use client";

import { useMetadataIntent } from "@/components/metadata-preload";
import { preloadPlayer } from "@/lib/preload-tools";

import { useEffect, useState } from "react";
import { Play, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePlaybackActions, type MediaToPlay } from "@/contexts/MediaPlayerContext";
import { fetchPlaybackProgress } from "@/app/actions";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatResumePosition, resumePlaybackTarget, type ResumeEpisode, type ResumeProgress } from "@/lib/media/resume-playback";
import { WATCH_HISTORY_CHANGED } from "@/lib/watch-history";
import { WatchToggleButton } from "@/components/media-page/watch-toggle-button";
import { ShuffleEpisodeButton } from "@/components/media-page/shuffle-episode-button";
import { useAccountAccess } from "@/contexts/account-context";

export function MediaPlayButton({ media, episodes }: { media: MediaToPlay; episodes?: ResumeEpisode[] }) {
    const { authenticated, requestSignIn } = useAccountAccess();
    const { playMedia } = usePlaybackActions();
    const id = media.seriesId || media.id;
    const sourceId = media.mediaSourceId;
    const key = `${media.type}:${id}:${sourceId || "overview"}`;
    const [saved, setSaved] = useState<{ key: string; progress: ResumeProgress | null } | null>(null);
    useEffect(() => {
        if (!authenticated) return;
        let cancelled = false;
        let generation = 0;
        const load = () => {
            const request = ++generation;
            void fetchPlaybackProgress(id, sourceId || (media.type === "movie" ? id : undefined))
                .then(progress => {
                    if (!cancelled && request === generation) setSaved({ key, progress });
                }).catch(() => {
                    if (!cancelled && request === generation) setSaved({ key, progress: null });
                });
        };
        const refresh = (event: Event) => {
            const changedId = (event as CustomEvent<{ id?: string }>).detail?.id;
            if (!changedId || changedId === id) load();
        };
        load();
        window.addEventListener(WATCH_HISTORY_CHANGED, refresh);
        window.addEventListener("focus", refresh);
        return () => {
            cancelled = true;
            window.removeEventListener(WATCH_HISTORY_CHANGED, refresh);
            window.removeEventListener("focus", refresh);
        };
    }, [id, sourceId, key, media.type, authenticated]);

    const checkingProgress = saved?.key !== key;
    const target = resumePlaybackTarget(media, checkingProgress ? {
        resumePositionTicks: media.resumePositionTicks, videoId: sourceId,
    } : saved.progress, episodes);
    const metadataIntent = useMetadataIntent(target);
    const warm = () => { if (authenticated) { preloadPlayer(); metadataIntent.start(); } };
    const resume = typeof target.resumePositionTicks === "number" && target.resumePositionTicks > 0;
    const overview = media.type === "series" && !sourceId;
    const context = resume ? overview
        ? `S${String(target.seasonNumber).padStart(2, "0")}E${String(target.episodeNumber).padStart(2, "0")}`
        : `from ${formatResumePosition(target.resumePositionTicks!)}` : "";

    return (
        <div className="mt-3 flex max-w-full flex-wrap items-center gap-2">
            <Button
                type="button"
                variant="default"
                size="lg" onPointerEnter={warm} onFocus={warm} onPointerLeave={metadataIntent.cancel} onBlur={metadataIntent.cancel}
                className="min-w-0 gap-2 rounded-full bg-foreground px-5 text-[15px] font-semibold text-background has-[>svg]:px-5 hover:bg-foreground/90 hover:ring-2 hover:ring-offset-2 hover:ring-primary hover:ring-offset-accent hover:shadow-xl hover:shadow-primary/30"
                disabled={authenticated && checkingProgress}
                aria-busy={(authenticated && checkingProgress) || undefined}
                aria-label={!authenticated ? `Sign in to play ${media.name}` : resume ? `Resume ${media.name} ${context}` : `Play ${media.name}`}
                onClick={() => authenticated ? playMedia(target) : requestSignIn()}
            >
                <Play aria-hidden="true" data-icon="inline-start" className="size-4 fill-current" />
                <span>
                    {!authenticated ? "Sign in to play" : resume ? "Resume" : "Play"}
                    {authenticated && resume && <> <span className="font-medium tabular-nums text-background/60">{context}</span></>}
                </span>
            </Button>
            {authenticated && resume && (
                <Tooltip delayDuration={600}>
                    <TooltipTrigger asChild>
                        <Button
                            type="button"
                            variant="secondary"
                            size="icon-lg"
                            className="shrink-0 rounded-full"
                            aria-label="Play from start"
                            disabled={checkingProgress}
                            onClick={() => playMedia({ ...target, resumePositionTicks: 0 })}
                        >
                            <RotateCw aria-hidden="true" strokeWidth={2.5} className="size-4" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent sideOffset={8}>Play from start</TooltipContent>
                </Tooltip>
            )}
            {authenticated && (media.type === "movie" || (media.type === "series" && sourceId)) && (
                <WatchToggleButton key={key} media={media} />
            )}
            {authenticated && overview && <ShuffleEpisodeButton key={id} media={media} episodes={episodes} />}
        </div>
    );
}
