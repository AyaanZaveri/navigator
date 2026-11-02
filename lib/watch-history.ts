export const WATCH_HISTORY_CHANGED = "navigator-watch-history-changed";

export interface WatchHistoryRequest {
    id: string;
    type: "movie" | "series";
}

export interface WatchHistoryItem {
    movieWatched: boolean;
    watchedEpisodeIds: string[];
}

export interface WatchStatusInput extends WatchHistoryRequest {
    name: string;
    videoId?: string;
    watched: boolean;
}

export const watchHistoryKey = ({ id, type }: WatchHistoryRequest) => `${type}:${id}`;
