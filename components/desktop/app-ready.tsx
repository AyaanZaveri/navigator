"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";
import { desktopBridge } from "@/lib/desktop/bridge";

/** Runs on login and signed-in routes, after hydration and a painted frame. */
export function DesktopAppReady() {
    const { resolvedTheme } = useTheme();
    useEffect(() => {
        const bridge = desktopBridge();
        if (bridge?.platform !== "windows" || !resolvedTheme) return;
        let second = 0;
        const first = requestAnimationFrame(() => {
            second = requestAnimationFrame(() => bridge.send({ type: "app-ready", dark: resolvedTheme === "dark" }));
        });
        return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
    }, [resolvedTheme]);
    return null;
}
