import type { MediaToPlay } from "@/lib/atoms";
import type { StremioStream } from "@/types/stremio";

export type PlaybackPhase = "finding-episode" | "fetching-streams" | "loading-stream";

interface PlaybackDependencies {
    fetchStreams: (_id: string, _type: string) => Promise<StremioStream[]>;
    getNextEpisodeForSeries: (_id: string) => Promise<{
        id: string; title: string; season: number; episode: number;
        resumePositionTicks?: number;
    } | null>;
}

export const playbackPhaseLabels: Record<PlaybackPhase, string> = {
    "finding-episode": "Finding an episode…",
    "fetching-streams": "Fetching streams…",
    "loading-stream": "Loading stream…",
};

/** Preserve add-on ranking; skip results that cannot be opened by the player. */
export async function resolvePlayback(
    request: MediaToPlay,
    dependencies: PlaybackDependencies,
    onPhase: (_phase: PlaybackPhase) => void,
    onTargetReady?: (_media: MediaToPlay) => void,
): Promise<MediaToPlay> {
    let media = { ...request };
    if (!media.streamUrl && media.type === "series" && !media.mediaSourceId) {
        onPhase("finding-episode");
        const seriesId = media.seriesId || media.id;
        const episode = await dependencies.getNextEpisodeForSeries(seriesId);
        if (!episode) throw new Error("No episode is available to play. Choose another title.");
        media = {
            ...media, id: seriesId, seriesId, showName: media.showName || media.name,
            name: episode.title, episodeTitle: episode.title,
            mediaSourceId: episode.id, seasonNumber: episode.season,
            episodeNumber: episode.episode, resumePositionTicks: episode.resumePositionTicks,
        };
    }
    onTargetReady?.(media);
    if (media.streamUrl) {
        onPhase("loading-stream");
        return media;
    }
    onPhase("fetching-streams");
    const streams = await dependencies.fetchStreams(media.mediaSourceId || media.id, media.type);
    const stream = streams.find(candidate => /^https?:\/\//i.test(candidate.url || candidate.externalUrl || ""));
    if (!stream) throw new Error("No playable streams found. Try another title or check your add-ons.");
    onPhase("loading-stream");
    return {
        ...media,
        streamUrl: stream.url || stream.externalUrl,
        requestHeaders: stream.behaviorHints?.proxyHeaders?.request,
        subtitleFilename: media.subtitleFilename || stream.behaviorHints?.filename,
        subtitleVideoSize: media.subtitleVideoSize ?? stream.behaviorHints?.videoSize,
    };
}
