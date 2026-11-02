export interface TrackDetails {
  language?: string;
  label?: string;
  filename?: string;
  provider?: string;
  src?: string;
}

const names = new Intl.DisplayNames(["en"], { type: "language", fallback: "none" });
const aliases: Record<string, string> = { pob: "pt-BR", pb: "pt-BR", scc: "sr", scr: "hr" };

export function trackLanguage(language?: string): { label: string; badge?: string } {
  const raw = language?.trim().replaceAll("_", "-").toLowerCase();
  if (!raw || ["unknown", "und", "mul", "zxx"].includes(raw)) return { label: "Unknown language" };
  try {
    const canonical = Intl.getCanonicalLocales(aliases[raw] ?? raw)[0];
    const label = names.of(canonical);
    if (label) return { label, badge: canonical.toUpperCase() };
  } catch { /* Malformed add-on language codes must not break the player menu. */ }
  return { label: "Unknown language" };
}

function subtitleFilename(src?: string): string | undefined {
  if (!src) return;
  try {
    const name = decodeURIComponent(new URL(src, "https://subtitle.invalid").pathname.split("/").pop() ?? "");
    if (/\.(?:srt|vtt|ass|ssa|sub)(?:\.gz)?$/i.test(name)
      && !/^(?:subtitles?|download|file|[a-z]{2,3})\./i.test(name)) return name;
  } catch { /* Never show signed query strings or URL tokens as filenames. */ }
}

export function describeTrack(track: TrackDetails, index: number) {
  const language = trackLanguage(track.language);
  const label = track.label?.trim();
  const isLanguageOnly = !label || [track.language, language.label, language.badge, "unknown"]
    .some(value => value?.toLowerCase() === label.toLowerCase());
  const filename = track.filename?.split(/[\\/]/).pop()?.trim() || subtitleFilename(track.src);
  const detail = filename || (!isLanguageOnly ? label : undefined) || `Track ${index + 1}`;
  return { ...language, description: [detail, track.provider?.trim()].filter(Boolean).join(" · ") };
}

/** Values refer to original track indices even when the visible options are sorted. */
export function trackOptions(tracks: TrackDetails[]) {
  return tracks.map((track, index) => ({ value: String(index), ...describeTrack(track, index) }))
    .sort((a, b) => Number(!!b.badge?.startsWith("EN")) - Number(!!a.badge?.startsWith("EN"))
      || a.label.localeCompare(b.label, "en") || Number(a.value) - Number(b.value));
}
