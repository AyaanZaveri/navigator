export interface PlaybackPreferences {
  audioLanguage: string;
  subtitleLanguage: string;
  subtitleMode: "normal" | "forced";
  subtitlesEnabledByDefault: boolean;
}
export const DEFAULT_PLAYBACK_PREFERENCES: PlaybackPreferences = {
  audioLanguage: "en", subtitleLanguage: "en", subtitleMode: "normal", subtitlesEnabledByDefault: false,
};
export const PLAYBACK_PREFERENCES_KEY = "navigator-playback-preferences";
// ISO 639-1 languages, with the same names/flags used by the player's tracks.
export const PLAYBACK_LANGUAGES = "aa ab ae af ak am an ar as av ay az ba be bg bh bi bm bn bo br bs ca ce ch co cr cs cu cv cy da de dv dz ee el en eo es et eu fa ff fi fj fo fr fy ga gd gl gn gu gv ha he hi ho hr ht hu hy hz ia id ie ig ii ik io is it iu ja jv ka kg ki kj kk kl km kn ko kr ks ku kv kw ky la lb lg li ln lo lt lu lv mg mh mi mk ml mn mr ms mt my na nb nd ne ng nl nn no nr nv ny oc oj om or os pa pi pl ps pt qu rm rn ro ru rw sa sc sd se sg si sk sl sm sn so sq sr ss st su sv sw ta te tg th ti tk tl tn to tr ts tt tw ty ug uk ur uz ve vi vo wa wo xh yi yo za zh zu".split(" ");
function language(value: unknown): string {
  if (typeof value !== "string") return "en";
  try {
    const canonical = Intl.getCanonicalLocales(value.trim().replaceAll("_", "-"))[0];
    return canonical && PLAYBACK_LANGUAGES.includes(canonical.split("-")[0]) ? canonical : "en";
  } catch { return "en"; }
}
export function normalizePlaybackPreferences(value: unknown): PlaybackPreferences {
  const candidate = value && typeof value === "object" ? value as Partial<PlaybackPreferences> : {};
  return {
    audioLanguage: language(candidate.audioLanguage), subtitleLanguage: language(candidate.subtitleLanguage),
    subtitleMode: candidate.subtitleMode === "forced" ? "forced" : "normal",
    subtitlesEnabledByDefault: candidate.subtitlesEnabledByDefault === true,
  };
}
let memory = { ...DEFAULT_PLAYBACK_PREFERENCES };
export function readPlaybackPreferences(): PlaybackPreferences {
  let stored: string | null;
  try { stored = localStorage.getItem(PLAYBACK_PREFERENCES_KEY); }
  catch { return { ...memory }; }
  try { return stored ? normalizePlaybackPreferences(JSON.parse(stored)) : { ...DEFAULT_PLAYBACK_PREFERENCES }; }
  catch { return { ...DEFAULT_PLAYBACK_PREFERENCES }; }
}
export function savePlaybackPreferences(value: PlaybackPreferences) {
  memory = normalizePlaybackPreferences(value);
  try { localStorage.setItem(PLAYBACK_PREFERENCES_KEY, JSON.stringify(memory)); } catch { /* Keep session preferences if storage is unavailable. */ }
}
