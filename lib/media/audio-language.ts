import type { StremioStream } from "@/types/stremio";

const smallCaps: Record<string, string> = { ᴀ: "a", ʙ: "b", ᴄ: "c", ᴅ: "d", ᴇ: "e", ꜰ: "f", ɢ: "g", ʜ: "h", ɪ: "i", ᴊ: "j", ᴋ: "k", ʟ: "l", ᴍ: "m", ɴ: "n", ᴏ: "o", ᴘ: "p", ʀ: "r", ꜱ: "s", ᴛ: "t", ᴜ: "u", ᴠ: "v", ᴡ: "w", ʏ: "y", ᴢ: "z" };
function normalize(text: string) {
    return text.replace(/[ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘʀꜱᴛᴜᴠᴡʏᴢ]/g, char => smallCaps[char]).normalize("NFKD").toLowerCase();
}
export function isEnglish(language = "") {
    return /^(en|eng|english)(?:[-_ ]|$)/.test(normalize(language).trim());
}
/** Audio labels only: an English subtitle does not make a foreign dub English. */
export function streamEnglishPreference(stream: StremioStream): number {
    const text = normalize([stream.name, stream.title, stream.description, stream.behaviorHints?.filename].filter(Boolean).join("\n"))
        .replace(/\b(?:en|eng|english)[ ._-]+sub(?:title)?s?\b/g, "subtitles")
        .split("\n").map(line => line.split(/\b(?:sub(?:title)?s?|captions?)\b/)[0]).join(" ");
    const english = /\b(?:en|eng|english)\b|🇬🇧|🇺🇸/.test(text);
    const foreign = /\b(?:ru|rus|russian|русский|hi|hin|hindi|fr|fre|fra|french|de|ger|deu|german|es|spa|spanish|ita|italian|jpn|japanese|kor|korean|chi|zho|chinese|tam|tamil|tel|telugu)\b|🇷🇺|🇮🇳|🇫🇷|🇩🇪|🇪🇸/.test(text);
    return english ? (foreign || /\b(?:multi|dual)\b/.test(text) ? 1 : 2) : foreign ? -1 : 0;
}
export function preferredEnglishTrack<T extends { language?: string; lang?: string; label?: string; title?: string }>(tracks: readonly T[]): T | undefined {
    return tracks.filter(track => {
        const language = track.language || track.lang;
        return language && language !== "und" ? isEnglish(language) : /\benglish\b/.test(normalize(track.label || track.title || ""));
    }).sort((a, b) => Number(/commentary|description|descriptive/i.test(a.label || a.title || ""))
        - Number(/commentary|description|descriptive/i.test(b.label || b.title || "")))[0];
}

interface AudioTrack { language?: string; label?: string; enabled: boolean }
interface AudioTrackList extends EventTarget { readonly length: number; [index: number]: AudioTrack }
/** Safari exposes alternate audio tracks; leave subsequent manual selections alone. */
export function installEnglishAudioPreference(media: HTMLVideoElement): () => void {
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
        const english = preferredEnglishTrack(tracks);
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
