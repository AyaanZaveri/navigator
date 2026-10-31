"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { averageLuminance, chooseLogoTone, getLogoSampleCrop, type LogoTone } from "@/lib/logo-contrast";
import { cn } from "@/lib/utils";

export function AdaptiveHeaderLogo({ adaptive }: { adaptive: boolean }) {
    const ref = useRef<HTMLSpanElement>(null);
    const pathname = usePathname();
    const { resolvedTheme } = useTheme();
    const key = `${pathname}:${resolvedTheme}`;
    const [sample, setSample] = useState<{ key: string; tone: LogoTone } | null>(null);
    const tone = adaptive && sample?.key === key ? sample.tone : null;

    useEffect(() => {
        const logo = ref.current;
        const scope = logo?.closest("header")?.parentElement;
        if (!adaptive || !logo || !scope) return;

        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 16;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return;

        let stopped = false;
        let frame = 0;
        let source = "";
        let readableImage: HTMLImageElement | null = null;
        let observedImage: HTMLImageElement | null = null;
        let previous: LogoTone | null = null;

        function fallback() {
            previous = null;
            setSample((current) => current === null ? current : null);
        }

        function schedule() {
            if (!stopped && !frame) frame = window.requestAnimationFrame(inspect);
        }

        const resize = new ResizeObserver(schedule);
        resize.observe(logo);
        resize.observe(scope);

        function inspect() {
            frame = 0;
            if (stopped || !logo || !scope || !context) return;
            const bounds = logo.getBoundingClientRect();
            const backdrop = Array.from(scope.querySelectorAll<HTMLImageElement>("img[data-header-backdrop]"))
                .find((image) => {
                    const rect = image.getBoundingClientRect();
                    return bounds.left >= rect.left && bounds.top >= rect.top
                        && bounds.right <= rect.right && bounds.bottom <= rect.bottom;
                });
            if (!backdrop) {
                fallback();
                return;
            }
            if (observedImage !== backdrop) {
                if (observedImage) resize.unobserve(observedImage);
                observedImage = backdrop;
                resize.observe(backdrop);
            }

            const nextSource = backdrop.currentSrc || backdrop.src;
            if (source !== nextSource) {
                source = nextSource;
                previous = null;
                fallback();
                if (readableImage) readableImage.onload = readableImage.onerror = null;
                const image = new window.Image();
                readableImage = image;
                // Use a separate CORS-enabled image so sampling cannot break displayed artwork.
                image.crossOrigin = "anonymous";
                image.onload = schedule;
                image.onerror = () => { if (!stopped) fallback(); };
                image.src = source;
            }

            if (!readableImage?.complete || !readableImage.naturalWidth) return;
            const imageStyle = window.getComputedStyle(backdrop);
            const crop = getLogoSampleCrop(readableImage.naturalWidth, readableImage.naturalHeight,
                backdrop.getBoundingClientRect(), bounds, imageStyle.objectPosition);
            if (!crop) {
                fallback();
                return;
            }
            try {
                context.globalAlpha = 1;
                context.fillStyle = window.getComputedStyle(document.documentElement).getPropertyValue("--background").trim();
                context.fillRect(0, 0, 16, 16);
                context.globalAlpha = Number(imageStyle.opacity);
                context.drawImage(readableImage, crop.x, crop.y, crop.width, crop.height, 0, 0, 16, 16);
                context.globalAlpha = 1;
                const brightness = averageLuminance(context.getImageData(0, 0, 16, 16).data);
                if (brightness === null) return;
                const nextTone = chooseLogoTone(brightness, previous);
                previous = nextTone;
                setSample((current) => current?.key === key && current.tone === nextTone ? current : { key, tone: nextTone });
            } catch {
                // Unsupported canvas/CORS falls back to the theme's existing logo.
                fallback();
            }
        }

        const changes = new MutationObserver(schedule);
        changes.observe(scope, { childList: true, subtree: true, attributes: true, attributeFilter: ["src", "srcset"] });
        scope.addEventListener("load", schedule, true);
        scope.addEventListener("error", schedule, true);
        window.addEventListener("resize", schedule, { passive: true });
        window.addEventListener("scroll", schedule, { capture: true, passive: true });
        schedule();

        return () => {
            stopped = true;
            window.cancelAnimationFrame(frame);
            resize.disconnect();
            changes.disconnect();
            if (readableImage) readableImage.onload = readableImage.onerror = null;
            scope.removeEventListener("load", schedule, true);
            scope.removeEventListener("error", schedule, true);
            window.removeEventListener("resize", schedule);
            window.removeEventListener("scroll", schedule, true);
        };
    }, [adaptive, key]);

    return (
        <span ref={ref} className="block size-8" data-logo-tone={tone ?? "theme"}>
            <Image src="/logo/navigator-header-light.svg?v=3" alt="" width={32} height={32} draggable={false}
                className={cn("size-8", tone === "dark" ? "block" : tone === "light" ? "hidden" : "dark:hidden")} />
            <Image src="/logo/navigator-header-dark.svg?v=2" alt="" width={32} height={32} draggable={false}
                className={cn("size-8", tone === "light" ? "block" : tone === "dark" ? "hidden" : "hidden dark:block")} />
        </span>
    );
}
