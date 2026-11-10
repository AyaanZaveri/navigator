import type { ComponentProps } from "react";
import styles from "./activity-text-shimmer.module.css";

/** Shared activity-text preset for Ask Navigator and playback loading states. */
export function ActivityTextShimmer({ className, ...props }: ComponentProps<"span">) {
    return <span {...props} className={[styles.text, className].filter(Boolean).join(" ")} />;
}
