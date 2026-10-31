"use client";

import { useSyncExternalStore } from "react";
import { useAtomValue } from "jotai";
import { useTheme } from "next-themes";
import { isPlayerVisibleAtom } from "@/lib/atoms";
import GradientASCII from "@/components/gradient-ascii/gradient-ascii";
import styles from "./home-gradient-background.module.css";

// sRGB avoids depending on Canvas2D support for newer CSS color syntax.
const subscribe = () => () => {};

const HOME_COLORS = ["#047857", "#ecfdf5", "#a7f3d0", "#34d399"];

const LIGHT_HOME_COLORS = ["#6ee7b7", "#ecfdf5", "#d1fae5", "#a7f3d0"];

export function HomeGradientBackground({ dotOpacity = 0.85 }: { dotOpacity?: number }) {
    const { resolvedTheme } = useTheme();
    const light = resolvedTheme !== "dark";
    const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
    const isPlayerVisible = useAtomValue(isPlayerVisibleAtom);

    if (isPlayerVisible) return null;

    return (
        <div aria-hidden="true" data-home-gradient="" className={`${styles.background} pointer-events-none fixed inset-0 z-0`}>
            {/* CSS supplies both themes before hydration and during GPU loss. */}
            {hydrated && (
                <div className={`${styles.animation} absolute inset-0`}>
                    <GradientASCII
                        colors={light ? LIGHT_HOME_COLORS : HOME_COLORS}
                        shape="horizon"
                        characters="·•●"
                        cellSize={18}
                        density={0.8}
                        speed={0.08}
                        flicker={0.05}
                        mouseInteraction={false}
                        clickEffect="none"
                        gradientOpacity={light ? 0.18 : 0.4}
                        glyphOpacity={dotOpacity}
                        glow={light ? 0 : 0.2}
                        grain={light ? 0 : 0.08}
                        lightMode={light}
                        dpr={1.5}
                    />
                </div>
            )}
        </div>
    );
}
