import { preferredAudioTrack } from "./audio-language";

export interface SubtitlePreferenceTrack {
  language?: string;
  lang?: string;
  label?: string;
  title?: string;
  filename?: string;
  forced?: boolean;
}
export function isForcedSubtitle(track: SubtitlePreferenceTrack): boolean {
  if (typeof track.forced === "boolean") return track.forced;
  return /(?:^|[^a-z])forced(?:$|[^a-z])/i.test([track.label, track.title, track.filename].filter(Boolean).join(" "));
}
/** Never silently substitute another language or normal captions for forced-only. */
export function preferredSubtitleTrack<T extends SubtitlePreferenceTrack>(tracks: readonly T[], language: string, mode: "normal" | "forced"): T | undefined {
  return preferredAudioTrack(tracks.filter(track => isForcedSubtitle(track) === (mode === "forced")), language);
}
