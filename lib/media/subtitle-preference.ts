import { preferredAudioTrack } from "./audio-language";

export interface SubtitlePreferenceTrack {
  id?: string | number;
  language?: string;
  lang?: string;
  label?: string;
  title?: string;
  filename?: string;
  forced?: boolean;
  hearingImpaired?: boolean;
  hearing_impaired?: boolean;
  sdh?: boolean;
}
export function isSDHSubtitle(track: SubtitlePreferenceTrack): boolean {
    return track.sdh === true || track.hearingImpaired === true || track.hearing_impaired === true
    || /(?:^|[^a-z])(?:sdh|cc|hi)(?:$|[^a-z])|hearing[ ._-]*impaired|closed[ ._-]*captions/i.test(
        [track.label, track.title, track.filename].filter(Boolean).join(" "));
}
export function isEnglishSubtitle(track: SubtitlePreferenceTrack): boolean {
    const language = (track.language || track.lang || "").trim();
    if (language && !/^(?:und|unknown)$/i.test(language)) return /^(?:en(?:[-_].*)?|eng|english)$/i.test(language);
    return /(?:^|[^a-z])(?:english|eng|en)(?:$|[^a-z])/i.test([track.label, track.title, track.filename, track.id].filter(Boolean).join(" "));
}
/** English comes before SDH, so foreign SDH never displaces English dialogue. */
export function navigatorSubtitleRank(track: SubtitlePreferenceTrack): number {
    return Number(isEnglishSubtitle(track)) * 100 + Number(!isForcedSubtitle(track)) * 10 + Number(isSDHSubtitle(track));
}
export function isForcedSubtitle(track: SubtitlePreferenceTrack): boolean {
    if (typeof track.forced === "boolean") return track.forced;
    return /(?:^|[^a-z])forced(?:$|[^a-z])/i.test([track.label, track.title, track.filename].filter(Boolean).join(" "));
}
/** Never silently substitute another language or normal captions for forced-only. */
export function preferredSubtitleTrack<T extends SubtitlePreferenceTrack>(tracks: readonly T[], language: string, mode: "normal" | "forced"): T | undefined {
    const eligible = tracks.filter(track => isForcedSubtitle(track) === (mode === "forced"));
    // Keep explicit language/forced preferences; prefer SDH within that choice.
    const candidates = eligible.filter(track => preferredAudioTrack([track], language)
        || (/^en(?:[-_]|$)/i.test(language) && isEnglishSubtitle(track)));
    const sdh = candidates.filter(isSDHSubtitle);
    const preferred = sdh.length ? sdh : candidates;
    return preferredAudioTrack(preferred, language) || preferred[0];
}
