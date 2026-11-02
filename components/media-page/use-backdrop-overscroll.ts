"use client";

import { useEffect, type RefObject } from "react";
import { attachBackdropStretch } from "@/lib/media/backdrop-stretch";
import { getLogoSampleCrop } from "@/lib/logo-contrast";
import styles from "./backdrop-transition.module.css";

/** Stretch one continuous artwork surface across browser and webview top-edge gestures. */
export function useBackdropOverscroll(imageRef: RefObject<HTMLImageElement | null>, source: string) {
    useEffect(() => {
        const image = imageRef.current;
        const scroller = image?.closest("main");
        const page = image?.closest<HTMLElement>(`.${styles.page}`);
        if (!source || !image || !scroller || !page) return;

        const surface = document.createElement("div");
        surface.className = styles.overscroll;
        surface.setAttribute("aria-hidden", "true");
        surface.setAttribute("data-backdrop-overscroll", "");
        surface.style.visibility = "hidden";
        const canvas = document.createElement("canvas");
        canvas.className = styles.overscrollArtwork;
        surface.append(canvas);
        page.prepend(surface);
        const context = canvas.getContext("2d");
        if (!context) {
            surface.remove();
            return;
        }

        let ready = false;
        let frame = 0;
        let visible = false;
        const originalTransform = image.style.transform;
        // Keep the viewport and its fixed aurora stationary. Translating the
        // scrollport changes fixed-position containment and clips that overlay.
        const originalTransforms = new Map<HTMLElement, string>();
        const reducedMotion = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
        const stretch = attachBackdropStretch(scroller, {
            enabled: () => ready && !reducedMotion?.matches,
            height: () => image.clientHeight,
            render: pull => {
                const scale = 1 + pull / Math.max(1, image.clientHeight);
                for (const child of Array.from(page.children)) {
                    if (child === surface || !(child instanceof HTMLElement)) continue;
                    if (!originalTransforms.has(child)) originalTransforms.set(child, child.style.transform);
                    const original = originalTransforms.get(child)!;
                    child.style.transform = pull ? `${original} translateY(${pull}px)`.trim() : original;
                }
                // Reveal only the gap, never a second full backdrop underneath
                // the hero's fade or behind its body text.
                surface.style.clipPath = `inset(0px 0px ${Math.max(0, scroller.clientHeight - pull)}px 0px)`;
                image.style.transform = pull ? `scale(${scale})` : originalTransform;
                canvas.style.transform = pull ? `scale(${scale})` : "";
            },
        });
        const updateStretch = () => stretch.refresh();
        const updateVisibility = () => {
            // The opaque media page masks this stationary backing during normal
            // scrolling. Keep it painted so native bounce never waits on JS.
            const nextVisible = ready;
            if (nextVisible === visible) return;
            visible = nextVisible;
            surface.style.visibility = visible ? "visible" : "hidden";
        };
        const draw = () => {
            frame = 0;
            ready = false;
            if (image.complete && image.naturalWidth && image.clientWidth && image.clientHeight) {
                const bounds = { left: 0, top: 0, width: image.clientWidth, height: image.clientHeight };
                // Preserve the hero's object-cover crop so the stationary copy
                // joins the stretching artwork at the native bounce boundary.
                const crop = getLogoSampleCrop(image.naturalWidth, image.naturalHeight,
                    bounds, bounds,
                    getComputedStyle(image).objectPosition);
                if (crop) {
                    // Rasterize once per source/resize, bounded to 2048px on
                    // either axis. Scrolling changes transforms, never pixels.
                    const density = Math.min(typeof devicePixelRatio === "number" ? devicePixelRatio : 1, 2,
                        2048 / Math.max(bounds.width, bounds.height));
                    canvas.width = Math.max(2, Math.round(bounds.width * density));
                    canvas.height = Math.max(2, Math.round(bounds.height * density));
                    context.imageSmoothingEnabled = true;
                    context.imageSmoothingQuality = "high";
                    context.drawImage(image, crop.x, crop.y, crop.width, crop.height,
                        0, 0, canvas.width, canvas.height);
                    surface.style.left = "0px";
                    surface.style.top = "0px";
                    surface.style.width = `${scroller.clientWidth}px`;
                    surface.style.height = `${scroller.clientHeight}px`;
                    canvas.style.height = `${image.clientHeight}px`;
                    ready = true;
                }
            }
            updateVisibility();
            updateStretch();
        };
        const scheduleDraw = () => {
            if (!frame) frame = requestAnimationFrame(draw);
        };
        const hide = () => {
            ready = false;
            updateVisibility();
            updateStretch();
        };
        const resize = new ResizeObserver(scheduleDraw);
        resize.observe(image);
        resize.observe(scroller);
        image.addEventListener("load", scheduleDraw);
        image.addEventListener("error", hide);
        reducedMotion?.addEventListener("change", updateStretch);
        scheduleDraw();

        return () => {
            cancelAnimationFrame(frame);
            resize.disconnect();
            image.removeEventListener("load", scheduleDraw);
            image.removeEventListener("error", hide);
            stretch.destroy();
            reducedMotion?.removeEventListener("change", updateStretch);
            image.style.transform = originalTransform;
            for (const [child, transform] of originalTransforms) child.style.transform = transform;
            surface.remove();
        };
    }, [imageRef, source]);
}
