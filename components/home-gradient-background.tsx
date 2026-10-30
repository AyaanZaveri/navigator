"use client";

import { useTheme } from "next-themes";
import GradientASCII from "@/components/gradient-ascii/gradient-ascii";

// Emerald 700 / 50 / 200 / 400 preserve the original blue palette's
// dark edge, near-white highlight, pale tint, and brighter final color.
const HOME_COLORS = [
    "oklch(50.8% 0.118 165.612)",
    "oklch(97.9% 0.021 166.113)",
    "oklch(90.5% 0.093 164.15)",
    "oklch(76.5% 0.177 163.223)",
];

export function HomeGradientBackground() {
    const { resolvedTheme } = useTheme();

    return (
        <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 opacity-40">
            <GradientASCII
                colors={HOME_COLORS}
                shape="horizon"
                characters=" .·•●"
                cellSize={18}
                density={0.8}
                speed={0.2}
                flicker={0.05}
                mouseInteraction={false}
                clickEffect="none"
                gradientOpacity={1}
                lightMode={resolvedTheme === "light"}
                dpr={1.5}
            />
        </div>
    );
}
