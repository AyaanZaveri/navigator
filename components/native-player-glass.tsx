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
        let requested = false, image: string | null = null;
        let visible: HTMLElement[] = [];
        const nodes = () => [...document.querySelectorAll<HTMLElement>("[data-player-glass]")];
        const paint = (node: HTMLElement) => {
            if (!image) return;
            // Scope frequently changing pixels to this small surface, rather
            // than inheriting a new image variable through the entire document.
            node.style.setProperty("--native-glass-image", image);
            if (!node.hasAttribute("data-native-glass")) node.setAttribute("data-native-glass", "");
        };
        const refresh = () => {
            visible = nodes().filter(node => node.getAttribute("aria-hidden") !== "true"
                && node.getClientRects().length && getComputedStyle(node).visibility !== "hidden");
            const wanted = !document.hidden && visible.length > 0;
            if (wanted !== requested) { requested = wanted; bridge.send({ type: "glass", session, active: wanted }); }
            if (!wanted) { visible = []; return; }
            for (const node of visible) {
                // Moving seek previews align in CSS on every gesture frame.
                // Only stationary controls need a measured origin here.
                if (node.getAttribute("data-slot") !== "media-player-seek-tooltip") {
                    const rect = node.getBoundingClientRect();
                    node.style.setProperty("--native-glass-x", `${-rect.left}px`);
                    node.style.setProperty("--native-glass-y", `${-rect.top}px`);
                }
                node.style.setProperty("--native-glass-size", `${window.innerWidth}px ${window.innerHeight}px`);
                node.style.setProperty("--native-glass-half-width", `${window.innerWidth/2}px`);
                node.style.setProperty("--native-glass-height", `${window.innerHeight}px`);
                paint(node);
            }
            // Preserve hidden surfaces' last material through their opacity exit.
        };
        const unsubscribe = bridge.subscribe(message => {
            if (message.type !== "glass-frame" || message.session !== session || !requested
                || !message.src.startsWith("data:image/jpeg;base64,") || message.src.length > 128*1024) return;
            image = `url("${message.src}")`;
            // New pixels require only local paint writes, never a layout read.
            for (const node of visible) paint(node);
        });
        const observer = new MutationObserver(records => {
            if (records.some(record => record.type === "attributes" || [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1))) refresh();
        });
        observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-controls-visible", "aria-hidden"] });
        const insets = new MutationObserver(refresh);
        insets.observe(document.documentElement, { attributes: true, attributeFilter: ["style", "class"] });
        document.addEventListener("visibilitychange", refresh);
        window.addEventListener("resize", refresh);
        refresh();
        return () => {
            observer.disconnect(); insets.disconnect(); unsubscribe();
            document.removeEventListener("visibilitychange", refresh); window.removeEventListener("resize", refresh);
            if (requested) bridge.send({ type: "glass", session, active: false });
            for (const node of nodes()) {
                node.removeAttribute("data-native-glass");
                for (const name of ["--native-glass-image", "--native-glass-x", "--native-glass-y", "--native-glass-size", "--native-glass-half-width", "--native-glass-height"]) node.style.removeProperty(name);
            }
        };
    }, [mediaRef, sourceKey, ready]);
    return null;
}
