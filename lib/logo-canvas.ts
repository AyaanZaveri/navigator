import type { LogoArtwork, LogoRect } from "./logo-backdrop";

interface CanvasSample {
    wake: () => void;
    requested?: LogoRect;
    rect?: LogoRect;
    image?: HTMLCanvasElement;
    captured: number;
}
const samples = new WeakMap<HTMLCanvasElement, CanvasSample>();
const same = (a: LogoRect | undefined, b: LogoRect) => a && a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height;

export function registerLogoCanvas(canvas: HTMLCanvasElement, wake: () => void) {
    const entry: CanvasSample = { wake, captured: -Infinity };
    samples.set(canvas, entry);
    return () => { if (samples.get(canvas) === entry) samples.delete(canvas); };
}

/** Called by the contrast sampler. Reading the WebGL canvas here would race
 * its discarded drawing buffer; instead request a crop from the next draw. */
export function logoCanvasSurface(canvas: HTMLCanvasElement, bounds: LogoRect): LogoArtwork | null {
    const entry = samples.get(canvas);
    if (!entry) return null;
    if (!same(entry.requested, bounds)) {
        entry.requested = { ...bounds };
        entry.wake();
    }
    if (!entry.image || !entry.rect) return null;
    return { image: entry.image, rect: entry.rect, opacity: 1, objectFit: "fill", objectPosition: "50% 50%" };
}

/** Must run immediately after presenting a frame. Only the small region
 * requested by the logo is copied; never retain the full-screen framebuffer. */
export function captureLogoCanvas(canvas: HTMLCanvasElement, now: number) {
    const entry = samples.get(canvas), request = entry?.requested;
    if (!entry || !request || now - entry.captured < 100 || document.hidden) return;
    const bounds = canvas.getBoundingClientRect();
    const left = Math.max(bounds.left, request.left), top = Math.max(bounds.top, request.top);
    const width = Math.min(bounds.right, request.left + request.width) - left;
    const height = Math.min(bounds.bottom, request.top + request.height) - top;
    if (width <= 0 || height <= 0 || !bounds.width || !bounds.height) return;
    const image = entry.image ?? document.createElement("canvas");
    image.width = image.height = 64;
    const context = image.getContext("2d");
    if (!context) return;
    try {
        context.drawImage(canvas, (left - bounds.left) / bounds.width * canvas.width,
            (top - bounds.top) / bounds.height * canvas.height,
            width / bounds.width * canvas.width, height / bounds.height * canvas.height, 0, 0, 64, 64);
        entry.image = image; entry.rect = { left, top, width, height }; entry.captured = now;
    } catch { /* Retain the last readable crop during context loss. */ }
}
