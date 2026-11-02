"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import AuroraTransition from "@/components/Aurora/AuroraTransition";
import styles from "@/components/Aurora/aurora.module.css";

interface AuroraBackgroundProps {
  colorStops: string[];
  amplitude?: number;
  blend?: number;
  className?: string;
  opacity?: number;
}

export function AuroraBackground({
    colorStops, amplitude = 0.8, blend = 0.4, opacity = 0.2,
    className = "fixed inset-0 z-0 pointer-events-none",
}: AuroraBackgroundProps) {
    const { resolvedTheme } = useTheme();
    const visibleOpacity = resolvedTheme === "dark" ? opacity : 0;
    const [activated, setActivated] = useState(false);
    useEffect(() => {
        if (activated || visibleOpacity <= 0) return;
        const frame = requestAnimationFrame(() => setActivated(true));
        return () => cancelAnimationFrame(frame);
    }, [activated, visibleOpacity]);
    return <div aria-hidden="true" className={`${className} ${styles.surface}`} style={{ opacity: visibleOpacity }}>
        {activated && <AuroraTransition colorStops={colorStops} amplitude={amplitude} blend={blend} paused={visibleOpacity === 0} />}
    </div>;
}
