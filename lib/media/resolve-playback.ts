import { languageMatchScore, streamLanguagePreference } from "@/lib/media/audio-language";
import type { MediaToPlay } from "@/lib/atoms";
import type { StreamMetadata, StreamTrackMetadata } from "@/lib/media/stream-metadata";
import type { StremioStream } from "@/types/stremio";
import type { PlaybackStreamRequest } from "@/lib/media/fetch-playback-streams";
import { parseStreamReleaseInfo } from "@/lib/media/stream-release-info";

export type PlaybackPhase = "finding-episode" | "fetching-streams" | "loading-stream";

interface PlaybackDependencies {
    autoSelectWebStream?: boolean;
    signal?: AbortSignal;
    createStreamRequest?: (_id: string, _type: string) => PlaybackStreamRequest;
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
    const release = parseStreamReleaseInfo(stream);
    const language = streamLanguagePreference(stream, preferredAudioLanguage);
    let score = languageScore(language);
    const supports = (mime: string) => canPlayType?.(mime) ?? false;
    const videoScores = release.videoCodecs.map(codec => {
        if (["H.264", "x264", "VP9"].includes(codec)) return 3000;
        if (["H.265", "x265"].includes(codec)) return supports('video/mp4; codecs="hvc1.1.6.L93.B0"') ? 3000 : -8000;
        if (codec === "AV1") return supports('video/mp4; codecs="av01.0.08M.08"') ? 3000 : -4000;
        return -8000;
    });
    const audioScores = release.audioCodecs.map(codec => {
        if (["AAC", "Opus", "Vorbis"].includes(codec)) return 2000;
        if (codec === "MP3") return 1800;
        if (["DDP", "EAC3"].includes(codec)) return supports('audio/mp4; codecs="ec-3"') ? 2000 : -6000;
        if (codec === "AC3") return supports('audio/mp4; codecs="ac-3"') ? 2000 : -6000;
        if (codec === "FLAC") return supports('audio/flac') ? 1500 : -3000;
        if (codec === "PCM") return supports('audio/wav') ? 1500 : -3000;
        return -10000;
    });
    // Mixed labels don't identify the default track. Conservatively rank them
    // below unambiguous compatible audio; actual track inspection decides later.
    if (videoScores.length) score += Math.min(...videoScores);
    if (audioScores.length) score += Math.min(...audioScores);
    if (["mp4", "m4v", "webm", "m3u8"].includes(release.container || "")) score += 1000;
    else if (release.container === "mkv") score -= 2000;
    else if (["avi", "m2ts", "ts"].includes(release.container || "")) score -= 6000;
    if (release.dynamicRange === "dolby-vision") score -= 5000;
    else if (release.dynamicRange) score -= 500;
    if (release.bitDepth && release.bitDepth > 8 && release.videoCodecs.some(codec => ["H.264", "x264"].includes(codec))) score -= 4000;
    if (["2160p", "4k"].includes(release.resolution || "")) score += 400;
    else if (release.resolution === "1080p") score += 300;
    else if (release.resolution === "720p") score += 200;
    else if (release.resolution === "480p") score += 100;
    if (["webdl", "webrip"].includes(release.source || "")) score += 40;
    if (release.videoOnly || release.audioOnly || release.noAudio) score -= 30000;
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

const INITIAL_WEB_PROBES = 2;
const HEDGED_WEB_PROBES = 3;
const WEB_PROBE_HEDGE_MS = 400;
const MAX_WEB_PROBE_CANDIDATES = 5;

/** Race bounded metadata reads, not players. Unknown is usable; proven missing/unsupported tracks are not. */
function selectFastWebStream(
    source: {
        promise: Promise<StremioStream[]>;
        subscribe(_listener: (_snapshot: { streams: StremioStream[]; complete: boolean }) => void): () => void;
    },
    dependencies: PlaybackDependencies,
    preferredLanguage: string,
): Promise<StremioStream> {
    return new Promise((resolve, reject) => {
        const support = new Map<string, ReturnType<typeof webMetadataSupport>>();
        const languages = new Map<string, string>();
        const releaseScores = new Map<StremioStream, number>();
        const checked = new Set<string>();
        let streams: StremioStream[] = [], complete = false, running = 0, selected = false, closed = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let hedgeTimer: ReturnType<typeof setTimeout> | undefined;
        let probeLimit = INITIAL_WEB_PROBES;
        let expired = false;
        let unsubscribe: (() => void) | undefined;
        const urlOf = (stream: StremioStream) => (stream.url || stream.externalUrl)!;
        const score = (stream: StremioStream) => {
            const language = languages.get(urlOf(stream));
            if (!releaseScores.has(stream)) releaseScores.set(stream, scoreWebStream(stream, dependencies.canPlayType, preferredLanguage));
            return releaseScores.get(stream)!
                + (language ? languageScore(languageMatchScore(language, preferredLanguage) ? 2 : -1)
                    - languageScore(streamLanguagePreference(stream, preferredLanguage)) : 0)
                + (support.get(urlOf(stream)) === "supported" ? 2000 : 0);
        };
        const ranked = () => {
            const seen = new Set<string>();
            return streams.filter(stream => {
                const url = urlOf(stream);
                if (!/^https?:\/\//i.test(url || "") || seen.has(url) || dependencies.excludeUrls?.has(url) || support.get(url) === "unsupported") return false;
                seen.add(url);
                return true;
            }).sort((a, b) => score(b) - score(a));
        };
        const cleanup = () => {
            closed = true;
            clearTimeout(timer);
            clearTimeout(hedgeTimer);
            unsubscribe?.();
            dependencies.signal?.removeEventListener("abort", abort);
        };
        const abort = () => {
            cleanup();
            if (!selected) reject(dependencies.signal?.reason || new Error("Playback selection cancelled"));
        };
        const choose = (stream: StremioStream) => {
            if (selected) return;
            selected = true;
            clearTimeout(timer);
            clearTimeout(hedgeTimer);
            // Background backups don't need the startup hedge's extra bandwidth.
            probeLimit = INITIAL_WEB_PROBES;
            resolve(stream);
        };
        const update = () => {
            if (closed) return;
            const candidates = ranked();
            dependencies.onCandidates?.(candidates);
            if (!selected && candidates.length && !timer) {
                // The budget starts with the first candidate, not before addon discovery.
                timer = setTimeout(() => { expired = true; update(); }, 2200);
            }
            const verified = candidates.find(stream => support.get(urlOf(stream)) === "supported"
                && (!languages.has(urlOf(stream)) || languageMatchScore(languages.get(urlOf(stream))!, preferredLanguage)));
            if (verified) choose(verified);
            if (!dependencies.inspectStream || !dependencies.canPlayType) {
                if (candidates[0]) choose(candidates[0]);
            } else {
                if (!selected && candidates.length && hedgeTimer === undefined && checked.size === 0) {
                    // A slow pair should not block a fast third candidate. This is a
                    // startup-only hedge, not three permanent background workers.
                    hedgeTimer = setTimeout(() => {
                        if (closed || selected) return;
                        probeLimit = HEDGED_WEB_PROBES;
                        update();
                    }, WEB_PROBE_HEDGE_MS);
                }
                // A small pool bounds bandwidth. Later arrivals may replace unstarted low-ranked candidates.
                while (running < probeLimit && checked.size < MAX_WEB_PROBE_CANDIDATES) {
                    const candidate = candidates.find(stream => !checked.has(urlOf(stream)));
                    if (!candidate) break;
                    const url = urlOf(candidate);
                    checked.add(url);
                    running++;
                    void Promise.resolve().then(() => closed ? undefined : dependencies.inspectStream!(candidate)).then(metadata => {
                        if (closed || !metadata) return;
                        support.set(url, webMetadataSupport(metadata, dependencies.canPlayType!));
                        const language = (metadata.audio.find(track => track.primary) || metadata.audio[0])?.language;
                        if (language && language !== "und") languages.set(url, language);
                    }).catch(() => { /* CORS, timeout and parse failure mean unknown, not broken. */ }).finally(() => {
                        running--;
                        update();
                    });
                }
                if (!selected && candidates[0] && (expired || (complete && running === 0))) choose(candidates[0]);
            }
            if (complete && running === 0) {
                cleanup();
                if (!selected) reject(new Error("No playable streams found. Try another title or check your add-ons."));
            }
        };
        if (dependencies.signal?.aborted) { abort(); return; }
        dependencies.signal?.addEventListener("abort", abort, { once: true });
        // subscribe immediately publishes its current snapshot, so cleanup can precede assignment.
        unsubscribe = source.subscribe(snapshot => {
            streams = snapshot.streams;
            complete = snapshot.complete;
            update();
        });
        if (closed) unsubscribe();
        void source.promise.catch(error => {
            if (closed) return;
            if (streams.length) { complete = true; update(); }
            else { cleanup(); if (!selected) reject(error); }
        });
    });
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
    const shared = request.streamRequest;
    const targetId = request.mediaSourceId || request.id;
    // A page may have started discovery under a TMDB id before playback canonicalized it.
    const knownStreams = shared && shared.type === request.type && (shared.id === targetId
        || (!request.streamUrl && await shared.canonicalId === targetId)) ? shared : undefined;
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
    const autoSelectWebStream = dependencies.environment === "web" && dependencies.autoSelectWebStream === true;
    const progressive = knownStreams || (autoSelectWebStream
        ? dependencies.createStreamRequest?.(media.mediaSourceId || media.id, media.type) : undefined);
    if (autoSelectWebStream) {
        const source = progressive || await (async () => {
            const streams = await dependencies.fetchStreams(media.mediaSourceId || media.id, media.type);
            const snapshot = { streams, complete: true, pending: 0, total: 0 };
            return {
                snapshot,
                promise: Promise.resolve(streams),
                subscribe(listener: (_snapshot: { streams: StremioStream[]; complete: boolean; pending: number; total: number }) => void) {
                    listener(snapshot);
                    return () => {};
                },
            };
        })();
        const stream = await selectFastWebStream(source, dependencies, preferredAudioLanguage);
        onPhase("loading-stream");
        return {
            ...media, streamRequest: progressive || media.streamRequest,
            streamUrl: stream.url || stream.externalUrl,
            requestHeaders: stream.behaviorHints?.proxyHeaders?.request,
            subtitleFilename: media.subtitleFilename || stream.behaviorHints?.filename,
            subtitleVideoSize: media.subtitleVideoSize ?? stream.behaviorHints?.videoSize,
        };
    }
    const streams = knownStreams ? await knownStreams.promise
        : await dependencies.fetchStreams(media.mediaSourceId || media.id, media.type);
    const seen = new Set<string>();
    const candidates = streams.filter(candidate => {
        const url = candidate.url || candidate.externalUrl || "";
        if (!/^https?:\/\//i.test(url) || seen.has(url) || dependencies.excludeUrls?.has(url)) return false;
        seen.add(url);
        return true;
    });
    const languagePreferences = new Map(candidates.map(candidate => [candidate, streamLanguagePreference(candidate, preferredAudioLanguage)]));
    candidates.sort((a, b) => languagePreferences.get(b)! - languagePreferences.get(a)!);
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
