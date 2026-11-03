import type { HTMLAttributes } from "react";
import type { SubtitleOutline, SubtitleSize } from "@/lib/subtitle-appearance";
import styles from "./subtitle-text.module.css";

/** Shared by playback and its settings preview. No backdrop sampling or box. */
export function SubtitleText({ size = "standard", outline = "thin", className, ...props }: HTMLAttributes<HTMLDivElement> & {
  size?: SubtitleSize;
  outline?: SubtitleOutline;
}) {
  return <div {...props} data-subtitle-text="" data-subtitle-size={size} data-subtitle-outline={outline}
    className={[styles.text, className].filter(Boolean).join(" ")} />;
}
