import { languageMatchScore } from "@/lib/media/audio-language";
import type { StreamMetadata, StreamTrackMetadata } from "@/lib/media/stream-metadata";

export function audioCodecString(track: StreamTrackMetadata): string | null {
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

export function audioTrackMime(track: StreamTrackMetadata): string | null {
    const codec = audioCodecString(track);
    if (!codec) return null;
    const type = /^(opus|vorbis)$/.test(codec) ? "audio/webm" : codec === "mp3" ? "audio/mpeg" : codec === "flac" ? "audio/flac" : codec === "pcm" ? "audio/wav" : "audio/mp4";
    return ["mp3", "flac", "pcm"].includes(codec) ? type : `${type}; codecs="${codec}"`;
}

export function metadataAudioSupport(metadata: StreamMetadata | undefined, canPlayType: (mime: string) => boolean, selectedLanguage?: string): "supported" | "unsupported" | "unknown" {
    if (!metadata) return "unknown";
    if (!metadata.video || !metadata.audio.length) return "unsupported";
    const selected = selectedLanguage
        ? metadata.audio.filter(audio => audio.language && languageMatchScore(audio.language, selectedLanguage) > 0).sort((a, b) => languageMatchScore(b.language!, selectedLanguage) - languageMatchScore(a.language!, selectedLanguage))[0]
            || metadata.audio.find(audio => audio.primary) || metadata.audio[0]
        : metadata.audio.find(audio => audio.primary) || metadata.audio[0];
    const mime = audioTrackMime(selected);
    if (!mime) return "unknown";
    return canPlayType(mime) ? "supported" : "unknown";
}
