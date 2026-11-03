import { trackOptions, type TrackDetails } from "@/lib/media/track-label";

const tracks: TrackDetails[] = [
  { language: "en", filename: "Modern.Family.S06E06.1080p.WEB-DL.en.srt", provider: "OpenSubtitles" },
  { language: "en", label: "English SDH", provider: "OpenSubtitles" },
  { language: "bs", provider: "OpenSubtitles" },
  { language: "es", provider: "OpenSubtitles" },
  { language: "pt-BR", provider: "OpenSubtitles" },
  { language: "und", provider: "OpenSubtitles" },
];
export const groups = [
  { title: "Playback", states: [
    { id: "normal", label: "Normal speed" },
    { id: "speed-changed", label: "Speed · 1.5×" },
    { id: "quality", label: "Quality choices" },
    { id: "disabled", label: "Settings disabled" },
  ] },
  { title: "Subtitles", states: [
    { id: "subtitles-off", label: "Off" },
    { id: "subtitles-selected", label: "English selected" },
    { id: "subtitles-empty", label: "No subtitle tracks" },
    { id: "subtitles-long", label: "Many subtitle tracks" },
    { id: "subtitles-unknown", label: "Unknown language selected" },
    { id: "timing-absent", label: "Timing unavailable in player" },
  ] },
  { title: "Subtitle timing", states: [
    { id: "timing-original", label: "Original · 0.0 s" },
    { id: "timing-earlier", label: "Earlier · −0.8 s" },
    { id: "timing-later", label: "Later · +1.2 s" },
    { id: "timing-minimum", label: "Minimum · −30.0 s" },
    { id: "timing-maximum", label: "Maximum · +30.0 s" },
    { id: "timing-disabled", label: "Track timing unsupported" },
  ] },
] as const;
export const states = groups.flatMap(group => [...group.states]);
export type StateId = typeof states[number]["id"];
export function readState(): StateId {
  const id = new URLSearchParams(window.location.search).get("__state");
  return states.find(state => state.id === id)?.id ?? "normal";
}
export function fixture(id: StateId) {
  const many = Array.from({ length: 72 }, (_, index): TrackDetails => ({
    ...tracks[index % tracks.length],
    filename: index % 3 === 0 ? `Modern.Family.S06E06.Halloween.3.Awesomeland.${index % 2 ? "1080p.WEB-DL" : "720p.BluRay"}.release-${index + 1}.srt` : undefined,
  }));
  return {
    speed: id === "speed-changed" ? 1.5 : 1,
    disabled: id === "disabled",
    quality: id === "quality",
    options: trackOptions(id === "subtitles-empty" ? [] : id === "subtitles-long" ? many : tracks),
    selected: id === "subtitles-unknown" ? "5" : id === "subtitles-selected" || id.startsWith("timing-") && id !== "timing-disabled" ? "0" : "off",
    hasTiming: id !== "timing-absent",
    timingOpen: id.startsWith("timing-") && id !== "timing-absent",
    timingAvailable: id !== "timing-disabled" && id !== "subtitles-empty",
    seconds: id === "timing-earlier" ? -.8 : id === "timing-later" ? 1.2 : id === "timing-minimum" ? -30 : id === "timing-maximum" ? 30 : 0,
  };
}
