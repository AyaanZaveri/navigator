import { preferredSubtitleTrack } from "./subtitle-preference";

export type PlaybackSubtitleTrack = {
    id?: string; filename?: string; provider?: string; kind: string; label: string;
    language: string; src: string; default?: boolean; forced?: boolean;
};
export type SubtitleHints = { filename?: string; videoSize?: number; episodeTitle?: string };
export type SubtitleFile = { success: boolean; content: string; error?: string };

export async function fetchPlaybackSubtitles(id: string, type: string, hints: SubtitleHints, signal: AbortSignal): Promise<PlaybackSubtitleTrack[]> {
    const params = new URLSearchParams({ id, type });
    if (hints.filename) params.set("filename", hints.filename);
    if (hints.videoSize) params.set("videoSize", String(hints.videoSize));
    if (hints.episodeTitle) params.set("episodeTitle", hints.episodeTitle);
    const response = await fetch(`/api/playback/subtitles?${params}`, { signal, cache: "no-store" });
    if (!response.ok) throw Error("Subtitle discovery failed");
    return (await response.json() as { tracks: PlaybackSubtitleTrack[] }).tracks;
}
export async function fetchPlaybackSubtitleFile(src: string, signal: AbortSignal): Promise<SubtitleFile> {
    const response = await fetch("/api/playback/subtitles", { method: "POST", signal, cache: "no-store",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ src }) });
    if (!response.ok) throw Error("Subtitle download failed");
    return response.json();
}

/** One playback attempt owns its in-flight requests and downloaded file. This
 * shares preloads with selection, without retaining private catalogs across users. */
export class PlaybackSubtitles {
    private catalogs = new Map<string, Promise<PlaybackSubtitleTrack[]>>();
    private files = new Map<string, Promise<SubtitleFile>>();
    constructor(private signal: AbortSignal,
        private tracks = fetchPlaybackSubtitles, private content = fetchPlaybackSubtitleFile) {}
    discover(id: string, type: string, hints: SubtitleHints = {}) {
        const key = JSON.stringify([id, type, hints.filename || "", hints.videoSize || 0, hints.episodeTitle || ""]);
        let pending = this.catalogs.get(key);
        if (!pending) {
            pending = this.tracks(id, type, hints, this.signal).catch(error => { this.catalogs.delete(key); throw error; });
            this.catalogs.set(key, pending);
        }
        return pending;
    }
    file(src: string) {
        let pending = this.files.get(src);
        if (!pending) {
            pending = this.content(src, this.signal).then(result => {
                if (!result.success) this.files.delete(src);
                return result;
            }).catch(error => { this.files.delete(src); throw error; });
            this.files.set(src, pending);
        }
        return pending;
    }
    preload(tracks: PlaybackSubtitleTrack[], preferences: { subtitlesEnabledByDefault: boolean; subtitleLanguage: string; subtitleMode: "normal" | "forced" }) {
        if (this.signal.aborted || !preferences.subtitlesEnabledByDefault) return;
        const track = preferredSubtitleTrack(tracks, preferences.subtitleLanguage, preferences.subtitleMode);
        if (track) void this.file(track.src).catch(() => {});
    }
}
