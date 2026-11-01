"use client";

import { useEffect, type RefObject } from "react";
import { desktopBridge } from "@/lib/desktop/bridge";
import type { MpvElementHandle } from "@/lib/desktop/mpv-element";

/** Native SurfaceView pixels cannot participate in a CSS backdrop filter. */
export function NativePlayerGlass({ mediaRef, sourceKey, ready }: {
    mediaRef: RefObject<HTMLVideoElement | null>; sourceKey: string; ready: boolean;
}) {
    useEffect(() => {
        const bridge = desktopBridge();
        const session = (mediaRef.current as unknown as MpvElementHandle | null)?.controller?.previewSession;
        if (!ready || bridge?.platform !== "android" || !bridge.capabilities?.glass || !session) return;
        let requested = false, frame = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const nodes = () => [...document.querySelectorAll<HTMLElement>("[data-player-glass]")];
        const refresh = () => {
            clearTimeout(timer);
            const visible = nodes().filter(node => node.getAttribute("aria-hidden") !== "true"
                && node.getClientRects().length && getComputedStyle(node).visibility !== "hidden");
            const wanted = !document.hidden && visible.length > 0;
            if (wanted !== requested) { requested = wanted; bridge.send({ type: "glass", session, active: wanted }); }
            for (const node of nodes()) {
                if (wanted && frame && visible.includes(node)) {
                    const rect = node.getBoundingClientRect();
                    node.style.setProperty("--native-glass-x", `${-rect.left}px`);
                    node.style.setProperty("--native-glass-y", `${-rect.top}px`);
                    node.style.setProperty("--native-glass-size", `${window.innerWidth}px ${window.innerHeight}px`);
                    node.setAttribute("data-native-glass", "");
                }
                // Keep the last material through the tooltip's opacity exit.
                // Sampling still stops immediately when no glass is visible.
            }
            if (wanted) timer = setTimeout(refresh, 250);
        };
        const unsubscribe = bridge.subscribe(message => {
            if (message.type !== "glass-frame" || message.session !== session || !requested
                || !message.src.startsWith("data:image/jpeg;base64,") || message.src.length > 128*1024) return;
            document.documentElement.style.setProperty("--native-glass-image", `url("${message.src}")`);
            frame = true; refresh();
        });
        const observer = new MutationObserver(records => {
            if (records.some(record => record.type === "attributes" || [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1))) refresh();
        });
        observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-controls-visible", "aria-hidden"] });
        document.addEventListener("visibilitychange", refresh);
        window.addEventListener("resize", refresh);
        refresh();
        return () => {
            clearTimeout(timer); observer.disconnect(); unsubscribe();
            document.removeEventListener("visibilitychange", refresh); window.removeEventListener("resize", refresh);
            if (requested) bridge.send({ type: "glass", session, active: false });
            document.documentElement.style.removeProperty("--native-glass-image");
            for (const node of nodes()) {
                node.removeAttribute("data-native-glass");
                for (const name of ["--native-glass-x", "--native-glass-y", "--native-glass-size"]) node.style.removeProperty(name);
            }
        };
    }, [mediaRef, sourceKey, ready]);
    return null;
}
