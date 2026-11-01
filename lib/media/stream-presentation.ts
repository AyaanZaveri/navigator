import type { StremioStream } from "@/types/stremio";

function cleanText(value = "") {
    return value.replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
        .split(/\r\n|\r|\n/)
        .map(line => line.replace(/[^\S\r\n]+/g, " ").trim())
        .filter(Boolean)
        .join("\n");
}

const RESOLUTION = /(?<![a-z0-9])(4320p|2160p|1440p|1080p|720p|576p|480p|360p|8k|4k|uhd)(?![a-z0-9])/i;
const SOURCE = /(?<![a-z0-9])(web[ ._-]*dl|web[ ._-]*rip|blu[ ._-]*ray|bd[ ._-]*rip|br[ ._-]*rip|dvd[ ._-]*rip|hdtv|remux|hdcam|cam|telesync|telecine)(?![a-z0-9])/i;
const STAR_RUN = /[★☆⭐](?:[\uFE0F \t]*[★☆⭐])*\uFE0F?/u;
const FILENAME = /\.(mkv|mp4|webm|avi|mov|m4v|m2ts|ts)\b/i;
const SOURCE_LABELS: Record<string, string> = {
    webdl: "WebDL", webrip: "WebRip", bluray: "BluRay", bdrip: "BDRip",
    brrip: "BRRip", dvdrip: "DVDRip", hdtv: "HDTV", remux: "Remux",
    hdcam: "HDCAM", cam: "CAM", telesync: "Telesync", telecine: "Telecine",
};

/** Parse explicit metadata, retaining unfamiliar add-on text as detail lines. */
export function getStreamPresentation(stream: Pick<StremioStream, "name" | "title" | "behaviorHints">) {
    const name = cleanText(stream.name);
    const title = cleanText(stream.title);
    const filename = cleanText(stream.behaviorHints?.filename);
    const display = [name, title].filter(Boolean).join("\n");
    const searchable = [display, filename].filter(Boolean).join("\n");
    const rawResolution = searchable.match(RESOLUTION)?.[1].toLowerCase();
    const resolution = rawResolution === "8k" ? "4320p"
        : rawResolution === "4k" || rawResolution === "uhd" ? "2160p" : rawResolution;
    const rawSource = searchable.match(SOURCE)?.[1];
    const source = rawSource ? SOURCE_LABELS[rawSource.toLowerCase().replace(/[ ._-]/g, "")] : undefined;
    // Avoid interpreting decorative stars embedded in filenames as ratings.
    const rating = display.split("\n").filter(line => !FILENAME.test(line)).join("\n").match(STAR_RUN)?.[0];
    const stars = rating ? Array.from(rating.matchAll(/[★☆⭐]/gu), match => match[0] !== "☆") : [];
    const lightning = display.includes("⚡");
    const details = Array.from(new Set(display.split("\n").flatMap(line => {
        if (line === filename) return [];
        if (FILENAME.test(line)) return [line];
        if (!RESOLUTION.test(line) && !SOURCE.test(line) && !STAR_RUN.test(line) && !line.includes("⚡")) return line ? [line] : [];
        const remainder = line.replace(RESOLUTION, "").replace(SOURCE, "")
            .replace(/⚡\uFE0F?/gu, "")
            .replace(STAR_RUN, "")
            .replace(/[〈〉〈〉‹›⟨⟩()[\]<>]/g, "")
            .replace(/\s+/g, " ").trim();
        return remainder ? [remainder] : [];
    })));
    return { resolution, source, lightning, stars, details };
}
