import type { CSSProperties, HTMLAttributes } from "react";
import { SUBTITLE_COLORS, type SubtitleOutline, type SubtitleSize, type SubtitleWeight, type SubtitleColor } from "@/lib/subtitle-appearance";
import styles from "./subtitle-text.module.css";

/** Shared by playback and its settings preview. No backdrop sampling or box. */
export function SubtitleText({ size = "standard", outline = "thin", weight = "medium", color = "white", className, style, ...props }: HTMLAttributes<HTMLDivElement> & {
  size?: SubtitleSize;
  outline?: SubtitleOutline;
  weight?: SubtitleWeight;
  color?: SubtitleColor;
}) {
  return <div {...props} data-subtitle-text="" data-subtitle-size={size} data-subtitle-outline={outline}
    data-subtitle-weight={weight} data-subtitle-color={color}
    style={{ ...style, "--subtitle-color": SUBTITLE_COLORS.find(option => option.value === color)?.color ?? "#ffffff" } as CSSProperties}
    className={[styles.text, className].filter(Boolean).join(" ")} />;
}
