import type { StremioStream } from "@/types/stremio";

const smallCaps: Record<string, string> = { ᴀ: "a", ʙ: "b", ᴄ: "c", ᴅ: "d", ᴇ: "e", ꜰ: "f", ɢ: "g", ʜ: "h", ɪ: "i", ᴊ: "j", ᴋ: "k", ʟ: "l", ᴍ: "m", ɴ: "n", ᴏ: "o", ᴘ: "p", ʀ: "r", ꜱ: "s", ᴛ: "t", ᴜ: "u", ᴠ: "v", ᴡ: "w", ʏ: "y", ᴢ: "z" };
function normalize(text: string) {
    return text.replace(/[ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘʀꜱᴛᴜᴠᴡʏᴢ]/g, char => smallCaps[char]).normalize("NFKD").toLowerCase();
}
export function isEnglish(language = "") {
    return /^(en|eng|english)(?:[-_ ]|$)/.test(normalize(language).trim());
}
const audioLanguages: Record<string, string[]> = {
    en: ["en", "eng", "english"], ru: ["ru", "rus", "russian", "русский"],
    fr: ["fr", "fre", "fra", "french"], de: ["de", "ger", "deu", "german"],
    es: ["es", "spa", "spanish"], it: ["it", "ita", "italian"], pt: ["pt", "por", "portuguese"],
    ja: ["ja", "jpn", "japanese"], ko: ["ko", "kor", "korean"], zh: ["zh", "chi", "zho", "chinese"],
    hi: ["hi", "hin", "hindi"], ta: ["ta", "tam", "tamil"], te: ["te", "tel", "telugu"],
    ar: ["ar", "ara", "arabic"], tr: ["tr", "tur", "turkish"], nl: ["nl", "dut", "nld", "dutch"],
    pl: ["pl", "pol", "polish"], bs: ["bs", "bos", "bosnian"], uk: ["uk", "ukr", "ukrainian"],
};
const languageNames = new Intl.DisplayNames(["en"], { type: "language", fallback: "none" });
const audioFlags: Record<string, string[]> = { en: ["🇬🇧", "🇺🇸"], ru: ["🇷🇺"], fr: ["🇫🇷"], de: ["🇩🇪"], es: ["🇪🇸"], pt: ["🇵🇹", "🇧🇷"], hi: ["🇮🇳"], ja: ["🇯🇵"], ko: ["🇰🇷"], it: ["🇮🇹"], zh: ["🇨🇳"] };
function canonicalLanguage(value: string): string {
    const raw = normalize(value).trim().replaceAll("_", "-");
    const alias = Object.entries(audioLanguages).find(([, tokens]) => tokens.includes(raw))?.[0];
    try { return Intl.getCanonicalLocales(alias || raw)[0]?.toLowerCase() || ""; } catch { return ""; }
}
export function languageMatchScore(language = "", preferred = "en"): number {
    const actual = canonicalLanguage(language), wanted = canonicalLanguage(preferred);
    return actual && wanted ? actual === wanted ? 2 : actual.split("-")[0] === wanted.split("-")[0] ? 1 : 0 : 0;
}
/** Audio labels only: preferred-language subtitles do not imply preferred audio. */
export function streamLanguagePreference(stream: StremioStream, preferred = "en"): number {
    const wanted = canonicalLanguage(preferred).split("-")[0] || "en";
    const tokens = audioLanguages[wanted] || [wanted, normalize(languageNames.of(wanted) || wanted)];
    const known = [...new Set([...Object.values(audioLanguages).flat(), ...tokens])];
    const text = normalize([stream.name, stream.title, stream.description, stream.behaviorHints?.filename].filter(Boolean).join("\n"))
        .replace(new RegExp(`\\b(?:${known.join("|")})[ ._-]+sub(?:title)?s?\\b`, "g"), "subtitles")
        .split("\n").map(line => line.split(/\b(?:sub(?:title)?s?|captions?)\b/)[0]).join(" ");
    const hasToken = (values: string[]) => values.some(value => new RegExp(`(?:^|[^a-z])${value}(?:$|[^a-z])`).test(text));
    const matches = hasToken(tokens) || (audioFlags[wanted] || []).some(flag => text.includes(flag));
    const other = Object.entries(audioLanguages).some(([language, values]) => language !== wanted && hasToken(values))
        || Object.entries(audioFlags).some(([language, flags]) => language !== wanted && flags.some(flag => text.includes(flag)));
    return matches ? (other || /\b(?:multi|dual)\b/.test(text) ? 1 : 2) : other ? -1 : 0;
}
export function streamEnglishPreference(stream: StremioStream): number { return streamLanguagePreference(stream, "en"); }
export function preferredAudioTrack<T extends { language?: string; lang?: string; label?: string; title?: string }>(tracks: readonly T[], preferred = "en"): T | undefined {
    const wanted = canonicalLanguage(preferred).split("-")[0];
    const labelName = normalize(languageNames.of(wanted || "en") || wanted);
    return tracks.filter(track => {
        const language = track.language || track.lang;
        return language && language !== "und" ? languageMatchScore(language, preferred) > 0
            : new RegExp(`(?:^|[^a-z])${labelName}(?:$|[^a-z])`).test(normalize(track.label || track.title || ""));
    }).sort((a, b) => Number(/commentary|description|descriptive/i.test(a.label || a.title || ""))
        - Number(/commentary|description|descriptive/i.test(b.label || b.title || ""))
        || languageMatchScore(b.language || b.lang, preferred) - languageMatchScore(a.language || a.lang, preferred))[0];
}
export function preferredEnglishTrack<T extends { language?: string; lang?: string; label?: string; title?: string }>(tracks: readonly T[]): T | undefined {
    return preferredAudioTrack(tracks, "en");
}

interface AudioTrack { language?: string; label?: string; enabled: boolean }
interface AudioTrackList extends EventTarget { readonly length: number; [index: number]: AudioTrack }
/** Safari exposes alternate audio tracks; leave subsequent manual selections alone. */
export function installAudioLanguagePreference(media: HTMLVideoElement, preferred = "en"): () => void {
    let chosen = false;
    let list: AudioTrackList | undefined;
    const choose = () => {
        const next = (media as HTMLVideoElement & { audioTracks?: AudioTrackList }).audioTracks;
        if (next !== list) {
            list?.removeEventListener("addtrack", choose);
            list = next;
            list?.addEventListener("addtrack", choose);
        }
        if (!list || chosen) return;
        const tracks = Array.from({ length: list.length }, (_, index) => list![index]);
        const english = preferredAudioTrack(tracks, preferred);
        if (!english) return;
        chosen = true;
        for (const track of tracks) track.enabled = track === english;
    };
    media.addEventListener("loadedmetadata", choose);
    media.addEventListener("canplay", choose);
    choose();
    return () => {
        media.removeEventListener("loadedmetadata", choose);
        media.removeEventListener("canplay", choose);
        list?.removeEventListener("addtrack", choose);
    };
}

export function installEnglishAudioPreference(media: HTMLVideoElement): () => void { return installAudioLanguagePreference(media, "en"); }
