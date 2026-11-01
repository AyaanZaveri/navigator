import type { MediaToPlay } from "@/lib/atoms";
import type { MediaItem } from "@/types/stremio";

export function getPlaybackTitles(media: MediaToPlay, details: MediaItem | null) {
    const sourceNumbers = media.mediaSourceId?.match(/:(\d+):(\d+)$/);
    const season = media.seasonNumber ?? (sourceNumbers ? Number(sourceNumbers[1]) : undefined);
    const episodeNumber = media.episodeNumber ?? (sourceNumbers ? Number(sourceNumbers[2]) : undefined);
    const isEpisode = media.type === "series" && Boolean(
        media.mediaSourceId || (season !== undefined && episodeNumber !== undefined),
    );
    const episode = details?.videos?.find(video => video.id === media.mediaSourceId)
        ?? details?.videos?.find(video => season !== undefined && episodeNumber !== undefined
            && video.season === season && video.episode === episodeNumber);
    const showTitle = media.showName || details?.name;
    // Older resume entries put the show name in both name and episodeTitle.
    const suppliedTitle = [media.episodeTitle, media.name].find(title => title?.trim() && title !== showTitle);
    const episodeTitle = episode?.title || episode?.name || suppliedTitle
        || (episodeNumber !== undefined ? "Episode " + episodeNumber : "Episode");
    return {
        isEpisode,
        episode,
        season,
        episodeNumber,
        episodeTitle,
        showTitle,
        primaryTitle: isEpisode ? episodeTitle : details?.name || media.name,
    };
}
