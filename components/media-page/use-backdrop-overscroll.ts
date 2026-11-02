"use client";

import { useEffect, type RefObject } from "react";
import { getLogoSampleCrop } from "@/lib/logo-contrast";
import styles from "./backdrop-transition.module.css";

/** Extend the hero through native overscroll, tracking its stretch without changing scroll physics. */
export function useBackdropOverscroll(imageRef: RefObject<HTMLImageElement | null>, source: string) {
    useEffect(() => {
        const image = imageRef.current;
        const scroller = image?.closest("main");
        const parent = scroller?.parentElement;
        if (!source || !image || !scroller || !parent) return;

        const surface = document.createElement("div");
        surface.className = styles.overscroll;
        surface.setAttribute("aria-hidden", "true");
        surface.setAttribute("data-backdrop-overscroll", "");
        surface.style.visibility = "hidden";
        const canvas = document.createElement("canvas");
        canvas.className = styles.overscrollArtwork;
        surface.append(canvas);
        parent.append(surface);
        const context = canvas.getContext("2d");
        if (!context) {
            surface.remove();
            return;
        }

        let ready = false;
        let frame = 0;
        let stretchFrame = 0;
        let visible = false;
        let lastScale = 1;
        const originalTransform = image.style.transform;
        const reducedMotion = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
        const updateStretch = () => {
            // WebKit reports the actual rubber-banded position. It already
            // includes resistance and the release spring: do not ease it twice.
            const pull = Number.isFinite(scroller.scrollTop) ? Math.max(0, -scroller.scrollTop) : 0;
            const scale = ready && !reducedMotion?.matches && image.clientHeight > 0 ? 1 + pull / image.clientHeight : 1;
            if (scale === lastScale) return;
            lastScale = scale;
            image.style.transform = scale === 1 ? originalTransform : `scale(${scale})`;
            canvas.style.transform = scale === 1 ? "" : `scale(${scale})`;
        };
        const onScroll = () => {
            // Chromium/Firefox clamp to zero; retain the stationary backing
            // there instead of intercepting wheel/touch or faking momentum.
            if (scroller.scrollTop >= 0 && lastScale === 1) return;
            if (!stretchFrame) stretchFrame = requestAnimationFrame(() => {
                stretchFrame = 0;
                updateStretch();
            });
        };
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
                    surface.style.left = `${scroller.offsetLeft}px`;
                    surface.style.top = `${scroller.offsetTop}px`;
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
        scroller.addEventListener("scroll", onScroll, { passive: true });
        reducedMotion?.addEventListener("change", updateStretch);
        scheduleDraw();

        return () => {
            cancelAnimationFrame(frame);
            cancelAnimationFrame(stretchFrame);
            resize.disconnect();
            image.removeEventListener("load", scheduleDraw);
            image.removeEventListener("error", hide);
            scroller.removeEventListener("scroll", onScroll);
            reducedMotion?.removeEventListener("change", updateStretch);
            image.style.transform = originalTransform;
            surface.remove();
        };
    }, [imageRef, source]);
}
