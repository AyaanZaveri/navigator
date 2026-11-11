import type { MediaItem } from '@/types/stremio';
import type { MediaToPlay } from '@/lib/atoms';
import { mergePlaybackDetails, playbackDetailsId, projectPlaybackDetails } from './playback-details';
import { getPlaybackTitles, isMeaningfulEpisodeTitle } from './playback-titles';

/** Data owned by the mounted details page, never a persistent/global response cache. */
export interface PlaybackPageContext {
  media: MediaItem;
}

export function applyPlaybackContext(request: MediaToPlay, page: PlaybackPageContext | null): MediaToPlay {
    if (!page || request.type !== page.media.type) return request;
    const pageId = playbackDetailsId(page.media);
    const requestId = playbackDetailsId(request);
    if (![pageId, page.media.imdbId, page.media.tmdbId ? `tmdb:${page.media.tmdbId}` : undefined].includes(requestId)) return request;
    if (request.type === 'series' && !request.mediaSourceId && !request.streamUrl) {
        const available = page.media.videos?.filter(video => typeof video.season === 'number' && video.season > 0
      && typeof video.episode === 'number' && video.episode > 0
      && (!video.released || Date.parse(video.released) <= Date.now()));
        const selected = request.seasonNumber !== undefined && request.episodeNumber !== undefined
            ? page.media.videos?.find(video => video.season === request.seasonNumber && video.episode === request.episodeNumber)
            : available?.sort((a, b) => a.season! - b.season! || a.episode! - b.episode!)[0];
        if (selected) request = { ...request, mediaSourceId: selected.id.replace(pageId, requestId),
            seasonNumber: selected.season, episodeNumber: selected.episode,
            episodeTitle: selected.title || selected.name || request.episodeTitle };
    }
    const titles = getPlaybackTitles(request, page.media);
    const details = mergePlaybackDetails(projectPlaybackDetails(page.media, titles.season, titles.episodeNumber), request.details);
    return { ...request, details, detailsLoaded: true,
        showName: request.type === 'series' ? request.showName || page.media.name : request.showName,
        ...(titles.isEpisode && isMeaningfulEpisodeTitle(titles.episodeTitle)
            ? { name: titles.episodeTitle, episodeTitle: titles.episodeTitle } : {}),
    };
}
