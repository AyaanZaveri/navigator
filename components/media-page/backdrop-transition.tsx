"use client";

import { ProgressiveBlur } from "@/components/motion-primitives/progressive-blur";
import styles from "./backdrop-transition.module.css";

export function BackdropTransition() {
    return (
        <div aria-hidden="true" className={styles.transition}>
            <ProgressiveBlur direction="bottom" blurLayers={4} blurIntensity={4} className={styles.blur} />
            <div data-header-backdrop-fade="" className={styles.fade} />
        </div>
    );
}
