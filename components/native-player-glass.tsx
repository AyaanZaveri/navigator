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
        if (!ready || !(bridge?.platform === "android" || bridge?.platform === "windows") || !bridge.capabilities?.glass || !session) return;
        let requested = false, image: string | null = null;
        let paintFrame: number | undefined;
        let visible: HTMLElement[] = [];
        const observed = new Set<HTMLElement>();
        const resized = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(() => refresh());
        const nodes = () => [...document.querySelectorAll<HTMLElement>("[data-player-glass], [data-player-native-glass]")];
        const paint = (node: HTMLElement) => {
            if (!image) return;
            // Scope frequently changing pixels to this small surface, rather
            // than inheriting a new image variable through the entire document.
            node.style.setProperty("--native-glass-image", image);
            if (!node.hasAttribute("data-native-glass")) node.setAttribute("data-native-glass", "");
        };
        const refresh = () => {
            for (const node of observed) if (node.isConnected === false) { resized?.unobserve(node); observed.delete(node); }
            visible = nodes().filter(node => node.getAttribute("aria-hidden") !== "true"
                && node.getClientRects().length && getComputedStyle(node).visibility !== "hidden");
            const wanted = !document.hidden && visible.length > 0;
            if (wanted !== requested) { requested = wanted; bridge.send({ type: "glass", session, active: wanted }); }
            if (!wanted) {
                visible = [];
                if (paintFrame !== undefined) { cancelAnimationFrame(paintFrame); paintFrame = undefined; }
                return;
            }
            for (const node of visible) {
                if (!observed.has(node)) { observed.add(node); resized?.observe(node); }
                // Moving seek previews align in CSS on every gesture frame.
                // Only stationary controls need a measured origin here.
                if (node.getAttribute("data-slot") !== "media-player-seek-tooltip") {
                    const rect = node.getBoundingClientRect();
                    if (node.hasAttribute("data-player-native-glass") && !node.hasAttribute("data-native-glass")) {
                        const style = getComputedStyle(node);
                        node.style.setProperty("--native-glass-color", style.backgroundColor);
                        node.style.setProperty("--native-glass-sheen", style.backgroundImage);
                    }
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
                || !(message.src.startsWith("data:image/jpeg;base64,") || (bridge.platform === "windows" && message.src.startsWith("data:image/bmp;base64,"))) || message.src.length > 128*1024) return;
            image = `url("${message.src}")`;
            // Windows delivers at video cadence. Keep only the latest sample
            // per display frame if WebView2 is busy; never replay old pixels.
            const draw = () => { paintFrame = undefined; for (const node of visible) paint(node); };
            if (bridge.platform === "windows") {
                if (paintFrame === undefined) paintFrame = requestAnimationFrame(draw);
            } else draw();
        });
        const observer = new MutationObserver(records => {
            if (records.some(record => (record.type === "attributes" && (record.attributeName !== "style" || record.target instanceof Element && record.target.hasAttribute("data-radix-popper-content-wrapper"))) || [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1))) refresh();
        });
        observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-controls-visible", "aria-hidden", "data-state", "style"] });
        const insets = new MutationObserver(refresh);
        insets.observe(document.documentElement, { attributes: true, attributeFilter: ["style", "class"] });
        document.addEventListener("visibilitychange", refresh);
        window.addEventListener("resize", refresh);
        refresh();
        return () => {
            observer.disconnect(); insets.disconnect(); resized?.disconnect(); observed.clear(); unsubscribe();
            if (paintFrame !== undefined) cancelAnimationFrame(paintFrame);
            document.removeEventListener("visibilitychange", refresh); window.removeEventListener("resize", refresh);
            if (requested) bridge.send({ type: "glass", session, active: false });
            for (const node of nodes()) {
                node.removeAttribute("data-native-glass");
                for (const name of ["--native-glass-image", "--native-glass-x", "--native-glass-y", "--native-glass-size", "--native-glass-half-width", "--native-glass-height", "--native-glass-color", "--native-glass-sheen"]) node.style.removeProperty(name);
            }
        };
    }, [mediaRef, sourceKey, ready]);
    return null;
}
