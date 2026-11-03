export const SUBTITLE_SIZES = [
  { value: "small", label: "Small" },
  { value: "standard", label: "Standard" },
  { value: "large", label: "Large" },
] as const;
export const SUBTITLE_OUTLINES = [
  { value: "thin", label: "Thin" },
  { value: "strong", label: "Strong" },
  { value: "none", label: "None" },
] as const;
export type SubtitleSize = typeof SUBTITLE_SIZES[number]["value"];
export type SubtitleOutline = typeof SUBTITLE_OUTLINES[number]["value"];
