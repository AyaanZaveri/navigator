import { languageMatchScore, streamLanguagePreference } from "@/lib/media/audio-language";
import type { MediaToPlay } from "@/lib/atoms";
import type { StreamMetadata, StreamTrackMetadata } from "@/lib/media/stream-metadata";
import type { StremioStream } from "@/types/stremio";

export type PlaybackPhase = "finding-episode" | "fetching-streams" | "loading-stream";

interface PlaybackDependencies {
    autoSelectWebStream?: boolean;
    preferredAudioLanguage?: string;
    resolveId?: (_id: string, _type: "movie" | "series") => Promise<string>;
    environment?: "web" | "native";
    inspectStream?: (_stream: StremioStream) => Promise<StreamMetadata | undefined>;
    canPlayType?: (_mime: string) => boolean;
    excludeUrls?: ReadonlySet<string>;
    onCandidates?: (_streams: StremioStream[]) => void;
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

/** Rank compatibility before quality: a high-resolution file with unsupported sound is not a good web source. */
export function scoreWebStream(stream: StremioStream, canPlayType?: (_mime: string) => boolean, preferredAudioLanguage = "en"): number {
    const url = stream.url || stream.externalUrl || "";
    let filename = url.split(/[?#]/)[0];
    try { filename = decodeURIComponent(filename); } catch { /* Add-ons may supply unescaped filenames. */ }
    const text = [stream.name, stream.title, stream.description, stream.behaviorHints?.filename, filename].join(" ")
        .toLowerCase().replace(/[\u200b-\u200f\u2060\ufeff]/g, "").replace(/_/g, " ");
    const language = streamLanguagePreference(stream, preferredAudioLanguage);
    let score = languageScore(language);
    const supports = (mime: string) => canPlayType?.(mime) ?? false;
    if (/\b(avc|h[ .-]?264|x264)\b/.test(text)) score += 3000;
    else if (/\b(hevc|h[ .-]?265|x265)\b/.test(text)) score += supports('video/mp4; codecs="hvc1.1.6.L93.B0"') ? 3000 : -8000;
    else if (/\bav1\b/.test(text)) score += supports('video/mp4; codecs="av01.0.08M.08"') ? 3000 : -4000;
    else if (/\bvp9\b/.test(text)) score += 3000;
    else if (/\b(xvid|divx|mpeg2)\b/.test(text)) score -= 8000;

    if (/\baac\b/.test(text)) score += 2000;
    else if (/\b(opus|vorbis)\b/.test(text)) score += 2000;
    else if (/\bmp3\b/.test(text)) score += 1800;
    else if (/\b(true[ .-]?hd|dts(?:[ .-]?hd)?|dts[ .-]?x)\b/.test(text)) score -= 10000;
    else if (/(?:\b(e[ .-]?ac[ .-]?3|ddp)(?:\b|(?=\d))|\bdd\+|\bdolby[ .-]+digital[ .-]+plus\b)/.test(text)) score += supports('audio/mp4; codecs="ec-3"') ? 2000 : -6000;
    else if (/\b(ac[ .-]?3|dd)(?:\b|(?=\d))/.test(text)) score += supports('audio/mp4; codecs="ac-3"') ? 2000 : -6000;
    else if (/\bflac\b/.test(text)) score += supports('audio/flac') ? 1500 : -3000;

    if (/\.(mp4|m4v|webm|m3u8)(?:\b|$)/.test(text)) score += 1000;
    else if (/\.mkv(?:\b|$)/.test(text)) score -= 2000;
    else if (/\.(avi|m2ts|ts)(?:\b|$)/.test(text)) score -= 6000;
    if (/\b(dv|dovi|dolby[ .-]?vision)\b/.test(text)) score -= 5000;
    else if (/\bhdr(?:10\+?)?\b/.test(text)) score -= 500;
    if (/\b(2160p|4k)\b/.test(text)) score += 400;
    else if (/\b1080p\b/.test(text)) score += 300;
    else if (/\b720p\b/.test(text)) score += 200;
    else if (/\b480p\b/.test(text)) score += 100;
    if (/\b(web[ .-]?dl|webrip)\b/.test(text)) score += 40;
    if (/\b(5[ .]1|7[ .]1)\b/.test(text)) score += 30;
    if (/\b(video[ -]?only|audio[ -]?only|no[ -]?audio|silent)\b/.test(text)) score -= 30000;
    if (stream.behaviorHints?.notWebReady) score -= 15000;
    if (Object.keys(stream.behaviorHints?.proxyHeaders?.request || {}).length) score -= 20000;
    if (!stream.url) score -= 6000;
    return score;
}

function languageScore(preference: number): number {
    return preference > 0 ? 3000 + preference * 1000 : preference * 5000;
}

/** A container can declare multiple tracks; check its primary audio, not any AAC tag in a release name. */
export function webMetadataSupport(metadata: StreamMetadata, canPlayType: (_mime: string) => boolean): "supported" | "unsupported" | "unknown" {
    if (!metadata.video || !metadata.audio.length) return "unsupported";
    const video = metadata.video;
    const videoType = video.codec === "vp8" || video.codec === "vp9" ? "video/webm" : "video/mp4";
    const videoSupported = video.codecString ? canPlayType(`${videoType}; codecs="${video.codecString}"`) : undefined;
    const audio = metadata.audio.find(track => track.primary) || metadata.audio[0];
    const codec = audioCodecString(audio);
    const audioType = /^(opus|vorbis)$/.test(codec || "") ? "audio/webm" : codec === "mp3" ? "audio/mpeg" : codec === "flac" ? "audio/flac" : codec === "pcm" ? "audio/wav" : "audio/mp4";
    const audioSupported = codec ? canPlayType(["mp3", "flac", "pcm"].includes(codec) ? audioType : `${audioType}; codecs="${codec}"`) : undefined;
    if (videoSupported === false || audioSupported === false) return "unsupported";
    return videoSupported && audioSupported ? "supported" : "unknown";
}

function audioCodecString(track: StreamTrackMetadata): string | null {
    const raw = `${track.codec || ""} ${track.internalCodecId || ""}`.toLowerCase();
    if (/e[_.-]?ac[_.-]?3|eac3/.test(raw)) return "ec-3";
    if (/ac[_.-]?3/.test(raw)) return "ac-3";
    if (/truehd/.test(raw)) return "mlpa";
    if (/dts/.test(raw)) return "dtsc";
    if (/pcm/.test(raw)) return "pcm";
    if (track.codecString) return track.codecString;
    if (/\baac\b/.test(raw)) return "mp4a.40.2";
    if (/opus/.test(raw)) return "opus";
    if (/vorbis/.test(raw)) return "vorbis";
    if (/mp3/.test(raw)) return "mp3";
    if (/flac/.test(raw)) return "flac";
    return null;
}

/** Prefer the requested audio language; retain add-on order within language tiers unless web compatibility selection is enabled. */
export async function resolvePlayback(
    request: MediaToPlay,
    dependencies: PlaybackDependencies,
    onPhase: (_phase: PlaybackPhase) => void,
    onTargetReady?: (_media: MediaToPlay) => void,
): Promise<MediaToPlay> {
    const preferredAudioLanguage = dependencies.preferredAudioLanguage || "en";
    let media = { ...request };
    const knownStreams = request.streamRequest?.id === (request.mediaSourceId || request.id)
        && request.streamRequest.type === request.type ? request.streamRequest : undefined;
    const tmdb = /^(tmdb:[1-9]\d*)(?::\d+:\d+)?$/.exec(media.seriesId || media.id);
    if (!media.streamUrl && tmdb && dependencies.resolveId && (media.type === "movie" || media.type === "series")) {
        const canonicalTarget = knownStreams ? await knownStreams.canonicalId : undefined;
        const id = canonicalTarget ? canonicalTarget.replace(/:(\d+):(\d+)$/, '') : await dependencies.resolveId(tmdb[1], media.type);
        media = { ...media, id, seriesId: media.type === "series" ? id : undefined,
            mediaSourceId: media.mediaSourceId?.replace(/^tmdb:[1-9]\d*(?=:|$)/, id) };
    }
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
    const streams = knownStreams ? await knownStreams.promise
        : await dependencies.fetchStreams(media.mediaSourceId || media.id, media.type);
    const seen = new Set<string>();
    let candidates = streams.filter(candidate => {
        const url = candidate.url || candidate.externalUrl || "";
        if (!/^https?:\/\//i.test(url) || seen.has(url) || dependencies.excludeUrls?.has(url)) return false;
        seen.add(url);
        return true;
    });
    const languagePreferences = new Map(candidates.map(candidate => [candidate, streamLanguagePreference(candidate, preferredAudioLanguage)]));
    const autoSelectWebStream = dependencies.environment === "web" && dependencies.autoSelectWebStream === true;
    if (autoSelectWebStream) {
        const scores = new Map(candidates.map(candidate => [candidate, scoreWebStream(candidate, dependencies.canPlayType, preferredAudioLanguage)]));
        candidates.sort((a, b) => scores.get(b)! - scores.get(a)!);
        if (dependencies.inspectStream && dependencies.canPlayType) {
            const support = new Map<StremioStream, ReturnType<typeof webMetadataSupport>>();
            const primaryLanguage = new Map<StremioStream, string>();
            await Promise.allSettled(candidates.slice(0, 3).map(async candidate => {
                const metadata = await dependencies.inspectStream!(candidate);
                if (metadata) {
                    support.set(candidate, webMetadataSupport(metadata, dependencies.canPlayType!));
                    const language = (metadata.audio.find(track => track.primary) || metadata.audio[0])?.language;
                    if (language && language !== "und") primaryLanguage.set(candidate, language);
                }
            }));
            candidates = candidates.filter(candidate => support.get(candidate) !== "unsupported");
            const inspectedScore = (candidate: StremioStream) => {
                const language = primaryLanguage.get(candidate);
                // Replace release-label guesses with the actual default audio language.
                const adjustment = language ? languageScore(languageMatchScore(language, preferredAudioLanguage) ? 2 : -1)
                    - languageScore(languagePreferences.get(candidate)!) : 0;
                return scores.get(candidate)! + adjustment
                    + (support.get(candidate) === "supported" ? 2000 : 0);
            };
            candidates.sort((a, b) => inspectedScore(b) - inspectedScore(a));
        }
    }
    if (!autoSelectWebStream) {
        candidates.sort((a, b) => languagePreferences.get(b)! - languagePreferences.get(a)!);
    }
    dependencies.onCandidates?.(candidates);
    const stream = candidates[0];
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
