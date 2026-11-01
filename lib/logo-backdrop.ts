import { getLogoSampleCrop } from "@/lib/logo-contrast";

type Rect = { left: number; top: number; width: number; height: number };
export type LogoOverlay = { rect: Rect; background: string; opacity: number };

function intersection(a: Rect, b: Rect): Rect | null {
    const left = Math.max(a.left, b.left), top = Math.max(a.top, b.top);
    const width = Math.min(a.left + a.width, b.left + b.width) - left;
    const height = Math.min(a.top + a.height, b.top + b.height) - top;
    return width > 0 && height > 0 ? { left, top, width, height } : null;
}

/** Split computed CSS gradient arguments without splitting color functions. */
export function gradientArguments(value: string): string[] {
    const result: string[] = [];
    let depth = 0, start = 0;
    for (let i = 0; i < value.length; i++) {
        if (value[i] === "(") depth++;
        else if (value[i] === ")") depth--;
        else if (value[i] === "," && depth === 0) { result.push(value.slice(start, i).trim()); start = i + 1; }
    }
    result.push(value.slice(start).trim());
    return result;
}

export function verticalGradientStops(background: string) {
    const match = /^linear-gradient\((.*)\)$/.exec(background);
    if (!match) return null;
    const args = gradientArguments(match[1]);
    if (/^(to bottom|180deg)(?: in .+)?$/.test(args[0])) args.shift();
    else if (/^(to |[\d.-]+deg)/.test(args[0])) return null;
    const stops = args.map((arg, index) => {
        const position = /^(.*)\s+([\d.-]+)%$/.exec(arg);
        return { color: position ? position[1] : arg, position: position ? Number(position[2]) / 100 : index / (args.length - 1) };
    });
    return stops.length >= 2 ? stops : null;
}

/** Rebuild the local rendered surface: page color, cropped artwork, page fade,
 * then header tint. Reading computed styles keeps this aligned with both themes. */
export function paintLogoBackdrop(
    context: CanvasRenderingContext2D, bounds: Rect, background: string,
    artwork: { image: HTMLImageElement; rect: Rect; opacity: number; objectPosition: string } | null,
    overlays: LogoOverlay[],
) {
    const { width, height } = context.canvas;
    context.clearRect(0, 0, width, height);
    context.save();
    try {
        context.scale(width / bounds.width, height / bounds.height);
        context.translate(-bounds.left, -bounds.top);
        context.globalAlpha = 1;
        context.fillStyle = background;
        context.fillRect(bounds.left, bounds.top, bounds.width, bounds.height);
        if (artwork) {
            const patch = intersection(bounds, artwork.rect);
            const crop = patch && getLogoSampleCrop(artwork.image.naturalWidth, artwork.image.naturalHeight, artwork.rect, patch, artwork.objectPosition);
            if (crop && patch) {
                context.globalAlpha = artwork.opacity;
                context.drawImage(artwork.image, crop.x, crop.y, crop.width, crop.height, patch.left, patch.top, patch.width, patch.height);
            }
        }
        for (const overlay of overlays) {
            const patch = intersection(bounds, overlay.rect);
            if (!patch || overlay.opacity <= 0) continue;
            const stops = verticalGradientStops(overlay.background);
            if (!stops) {
                if (overlay.background.startsWith("linear-gradient(")) continue;
                context.globalAlpha = overlay.opacity;
                context.fillStyle = overlay.background;
                context.fillRect(patch.left, patch.top, patch.width, patch.height);
                continue;
            }
            const gradient = context.createLinearGradient(0, overlay.rect.top, 0, overlay.rect.top + overlay.rect.height);
            for (const stop of stops) gradient.addColorStop(Math.max(0, Math.min(1, stop.position)), stop.color);
            context.globalAlpha = overlay.opacity;
            context.fillStyle = gradient;
            context.fillRect(patch.left, patch.top, patch.width, patch.height);
        }
    } finally {
        context.restore();
    }
}

/** Read our canonical artwork through a byte response, rather than a CDN
 * redirect that can display normally but make canvas sampling fail CORS. */
export function logoSampleSource(source: string, origin: string) {
    const url = new URL(source, origin);
    if (url.origin === origin && url.pathname === "/api/artwork" && url.searchParams.get("kind") === "backdrop") {
        url.searchParams.set("sample", "1");
        return url.href;
    }
    return source;
}
