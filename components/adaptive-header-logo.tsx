"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { HEADER_LOGO_SOURCES, chooseLogoTreatment, type LogoPixels, type LogoTone } from "@/lib/logo-contrast";
import { logoSampleSource, paintLogoBackdrop } from "@/lib/logo-backdrop";
import { cn } from "@/lib/utils";
import styles from "./adaptive-header-logo.module.css";

export function AdaptiveHeaderLogo({ adaptive }: { adaptive: boolean }) {
    const ref = useRef<HTMLSpanElement>(null);
    const pathname = usePathname();
    const { resolvedTheme } = useTheme();
    // A theme change resamples the surface without discarding the current tone.
    const [sample, setSample] = useState<{ key: string; treatment: LogoTone } | null>(null);
    const tone = adaptive && sample?.key === pathname ? sample.treatment : null;

    useEffect(() => {
        const logo = ref.current;
        const scope = logo?.closest("header")?.parentElement;
        if (!adaptive || !logo || !scope) return;

        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 64;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return;

        let stopped = false;
        let frame = 0;
        let settleUntil = 0;
        let source = "";
        let readableImage: HTMLImageElement | null = null;
        let observedImage: HTMLImageElement | null = null;
        let previous: LogoTone | null = null;
        const logoPixels: Partial<LogoPixels> = {};
        const paletteCanvas = document.createElement("canvas");
        paletteCanvas.width = paletteCanvas.height = canvas.width;
        const paletteContext = paletteCanvas.getContext("2d", { willReadFrequently: true });
        if (!paletteContext) return;
        const paletteImages = (Object.keys(HEADER_LOGO_SOURCES) as LogoTone[]).map(tone => {
            const image = new window.Image();
            image.onload = () => {
                if (stopped) return;
                try {
                    paletteContext.clearRect(0, 0, canvas.width, canvas.height);
                    paletteContext.drawImage(image, 0, 0, canvas.width, canvas.height);
                    logoPixels[tone] = paletteContext.getImageData(0, 0, canvas.width, canvas.height).data;
                    schedule();
                } catch { /* Retain the current tone if a palette cannot be read. */ }
            };
            image.src = HEADER_LOGO_SOURCES[tone];
            return image;
        });

        function schedule() {
            // Keep sampling through the header's 180ms opacity transition,
            // including after the final scroll event in a fling.
            settleUntil = performance.now() + 220;
            if (!stopped && !frame) frame = window.requestAnimationFrame(inspect);
        }

        const resize = new ResizeObserver(schedule);
        resize.observe(logo);
        resize.observe(scope);

        function inspect() {
            frame = 0;
            if (stopped || !logo || !scope || !context) return;
            if (!logoPixels.light || !logoPixels.dark || !logoPixels.deep) return;
            const bounds = logo.getBoundingClientRect();
            const backdrop = Array.from(scope.querySelectorAll<HTMLImageElement>("img[data-header-backdrop]"))
                .find((image) => {
                    const rect = image.getBoundingClientRect();
                    return bounds.left < rect.right && bounds.top < rect.bottom
                        && bounds.right > rect.left && bounds.bottom > rect.top;
                });
            if (backdrop && observedImage !== backdrop) {
                if (observedImage) resize.unobserve(observedImage);
                observedImage = backdrop;
                resize.observe(backdrop);
            }

            if (backdrop) {
                const nextSource = backdrop.currentSrc || backdrop.src;
                if (source !== nextSource) {
                    source = nextSource;
                    previous = null;
                    if (readableImage) readableImage.onload = readableImage.onerror = null;
                    const image = new window.Image();
                    readableImage = image;
                    image.crossOrigin = "anonymous";
                    image.onload = schedule;
                    // Preserve the last sampled tone if a source temporarily fails.
                    image.onerror = () => {};
                    image.src = logoSampleSource(source, window.location.origin);
                }
                if (!readableImage?.complete || !readableImage.naturalWidth) return;
            }

            try {
                const imageStyle = backdrop ? window.getComputedStyle(backdrop) : null;
                const overlays = Array.from(scope.querySelectorAll<HTMLElement>("[data-header-backdrop-fade], [data-header-tint]"))
                    // Page fade paints first; the fixed header tint paints last.
                    .sort((a, b) => Number(a.hasAttribute("data-header-tint")) - Number(b.hasAttribute("data-header-tint")))
                    .map(element => {
                        const style = window.getComputedStyle(element);
                        return { rect: element.getBoundingClientRect(), background: style.backgroundImage === "none" ? style.backgroundColor : style.backgroundImage, opacity: Number(style.opacity) };
                    });
                paintLogoBackdrop(context, bounds,
                    window.getComputedStyle(document.documentElement).getPropertyValue("--background").trim(),
                    backdrop && readableImage && imageStyle ? {
                        image: readableImage, rect: backdrop.getBoundingClientRect(),
                        opacity: Number(imageStyle.opacity), objectPosition: imageStyle.objectPosition,
                    } : null, overlays);
                const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
                const nextTreatment = chooseLogoTreatment(pixels, logoPixels as LogoPixels, previous);
                previous = nextTreatment;
                setSample(current => current?.key === pathname && current.treatment === nextTreatment ? current : { key: pathname, treatment: nextTreatment });
            } catch {
                // Unsupported sources retain the last valid reading instead of
                // flipping to the theme while the same artwork remains visible.
            }
            if (performance.now() < settleUntil) frame = window.requestAnimationFrame(inspect);
        }

        const changes = new MutationObserver(schedule);
        changes.observe(scope, { childList: true, subtree: true, attributes: true, attributeFilter: ["src", "srcset"] });
        scope.addEventListener("load", schedule, true);
        window.addEventListener("resize", schedule, { passive: true });
        window.addEventListener("scroll", schedule, { capture: true, passive: true });
        schedule();

        return () => {
            stopped = true;
            window.cancelAnimationFrame(frame);
            resize.disconnect();
            changes.disconnect();
            if (readableImage) readableImage.onload = readableImage.onerror = null;
            paletteImages.forEach(image => { image.onload = null; });
            scope.removeEventListener("load", schedule, true);
            window.removeEventListener("resize", schedule);
            window.removeEventListener("scroll", schedule, true);
        };
    }, [adaptive, pathname, resolvedTheme]);

    return (
        <span ref={ref} className={styles.frame} data-logo-tone={tone ?? "theme"}>
            <Image src={HEADER_LOGO_SOURCES.dark} alt="" width={32} height={32} draggable={false}
                className={cn(styles.mark, tone === "dark" ? "opacity-100" : tone ? "opacity-0" : "opacity-100 dark:opacity-0")} />
            <Image src={HEADER_LOGO_SOURCES.light} alt="" width={32} height={32} draggable={false}
                className={cn(styles.mark, tone === "light" ? "opacity-100" : tone ? "opacity-0" : "opacity-0 dark:opacity-100")} />
            <Image src={HEADER_LOGO_SOURCES.deep} alt="" width={32} height={32} draggable={false}
                className={cn(styles.mark, tone === "deep" ? "opacity-100" : "opacity-0")} />
        </span>
    );
}
