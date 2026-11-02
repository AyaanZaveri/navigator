"use client";

import { useEffect, type RefObject } from "react";
import { getLogoSampleCrop } from "@/lib/logo-contrast";
import styles from "./backdrop-transition.module.css";

/** Paint the rendered top edge behind the scrollport, outside its bounce layer. */
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
        let visible = false;
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
                // Sample the actual object-cover crop, including on tall mobile heroes.
                // A shallow strip retains horizontal color without repeating faces.
                const crop = getLogoSampleCrop(image.naturalWidth, image.naturalHeight,
                    bounds, { ...bounds, height: Math.min(12, bounds.height) },
                    getComputedStyle(image).objectPosition);
                if (crop) {
                    // Bake softness into a tiny bitmap by downsampling. Scaling
                    // it back up needs no live CSS blur over the full scrollport.
                    canvas.width = Math.max(2, Math.min(128, Math.ceil(image.clientWidth / 16)));
                    canvas.height = 2;
                    context.imageSmoothingEnabled = true;
                    context.imageSmoothingQuality = "high";
                    context.drawImage(image, crop.x, crop.y, crop.width, crop.height,
                        0, 0, canvas.width, canvas.height);
                    surface.style.left = `${scroller.offsetLeft}px`;
                    surface.style.top = `${scroller.offsetTop}px`;
                    surface.style.width = `${scroller.clientWidth}px`;
                    surface.style.height = `${Math.min(scroller.clientHeight, image.clientHeight)}px`;
                    ready = true;
                }
            }
            updateVisibility();
        };
        const scheduleDraw = () => {
            if (!frame) frame = requestAnimationFrame(draw);
        };
        const hide = () => {
            ready = false;
            updateVisibility();
        };
        const resize = new ResizeObserver(scheduleDraw);
        resize.observe(image);
        resize.observe(scroller);
        image.addEventListener("load", scheduleDraw);
        image.addEventListener("error", hide);
        scheduleDraw();

        return () => {
            cancelAnimationFrame(frame);
            resize.disconnect();
            image.removeEventListener("load", scheduleDraw);
            image.removeEventListener("error", hide);
            surface.remove();
        };
    }, [imageRef, source]);
}
