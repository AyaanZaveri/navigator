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

export const SUBTITLE_WEIGHTS = [
  { value: "regular", label: "Regular" },
  { value: "medium", label: "Medium" },
  { value: "semibold", label: "Semibold" },
  { value: "bold", label: "Bold" },
] as const;
export const SUBTITLE_COLORS = [
  { value: "white", label: "White", color: "#ffffff" },
  { value: "warm-white", label: "Warm white", color: "#fff4dc" },
  { value: "yellow", label: "Yellow", color: "#ffe45c" },
  { value: "light-blue", label: "Light blue", color: "#bde7ff" },
] as const;
export type SubtitleWeight = typeof SUBTITLE_WEIGHTS[number]["value"];
export type SubtitleColor = typeof SUBTITLE_COLORS[number]["value"];
