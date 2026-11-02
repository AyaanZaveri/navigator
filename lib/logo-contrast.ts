export type LogoTone = "light" | "dark" | "deep" | "neutral";
export const HEADER_LOGO_SOURCES: Record<LogoTone, string> = {
    dark: "/logo/navigator-header-light.svg?v=3",
    light: "/logo/navigator-header-dark.svg?v=2",
    deep: "/logo/navigator-header-high-contrast.svg?v=1",
    neutral: "/logo/navigator-header-neutral.svg?v=1",
};
export type LogoPixels = Record<LogoTone, ArrayLike<number>>;
type Rectangle = { left: number; top: number; width: number; height: number };

function linearChannel(channel: number): number {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(red: number, green: number, blue: number): number {
    return 0.2126 * linearChannel(red) + 0.7152 * linearChannel(green) + 0.0722 * linearChannel(blue);
}

/** Compare actual SVG stroke interiors with the background directly beneath them. */
export function minimumLogoContrast(background: ArrayLike<number>, logo: ArrayLike<number>): number {
    if (background.length !== logo.length) return 0;
    let minimum = Infinity;
    for (let i = 0; i + 3 < logo.length; i += 4) {
        // Anti-aliased edges and transparent gaps must not determine the tone.
        if (logo[i + 3] < 242 || background[i + 3] < 242) continue;
        const foreground = luminance(logo[i], logo[i + 1], logo[i + 2]);
        const surface = luminance(background[i], background[i + 1], background[i + 2]);
        minimum = Math.min(minimum, (Math.max(foreground, surface) + .05) / (Math.min(foreground, surface) + .05));
    }
    return Number.isFinite(minimum) ? minimum : 0;
}

export function chooseLogoTreatment(background: ArrayLike<number>, logos: LogoPixels, current: LogoTone | null = null): LogoTone {
    const tones: LogoTone[] = ["light", "dark", "deep", "neutral"];
    const scores = Object.fromEntries(tones.map(tone => [tone, minimumLogoContrast(background, logos[tone])])) as Record<LogoTone, number>;
    const branded: LogoTone[] = ["light", "dark", "deep"];
    let best = branded.reduce((a, b) => scores[a] >= scores[b] ? a : b);
    // Preserve the brand when readable. On muddy midtones, use near-white only
    // when it improves contrast. Leave a small exit band to prevent toggling.
    const brandTarget = current === "neutral" ? 3.3 : 3;
    if (scores[best] < brandTarget && scores.neutral > scores[best]) best = "neutral";
    // Never let hysteresis keep a failing teal when a readable variant exists,
    // or retain neutral once the brand has cleared its exit threshold.
    if (current && (current === "neutral") === (best === "neutral")
        && (scores[current] >= 3 || scores[best] < 3)
        && scores[best] < scores[current] + .3) return current;
    return best;
}

function positionOffset(position: string, space: number): number {
    const value = Number.parseFloat(position);
    if (!Number.isFinite(value)) return space / 2;
    return position.endsWith("%") ? space * value / 100 : value;
}

/** Map the logo's screen rectangle to the actual source pixels after object-cover. */
export function getLogoSampleCrop(
    naturalWidth: number,
    naturalHeight: number,
    image: Rectangle,
    logo: Rectangle,
    objectPosition = "50% 50%",
): { x: number; y: number; width: number; height: number } | null {
    if (![naturalWidth, naturalHeight, image.width, image.height, logo.width, logo.height].every((value) => Number.isFinite(value) && value > 0)) return null;
    if (logo.left < image.left || logo.top < image.top
        || logo.left + logo.width > image.left + image.width
        || logo.top + logo.height > image.top + image.height) return null;

    const scale = Math.max(image.width / naturalWidth, image.height / naturalHeight);
    const [horizontal = "50%", vertical = "50%"] = objectPosition.split(/\s+/);
    const offsetX = positionOffset(horizontal, image.width - naturalWidth * scale);
    const offsetY = positionOffset(vertical, image.height - naturalHeight * scale);
    const crop = {
        x: (logo.left - image.left - offsetX) / scale,
        y: (logo.top - image.top - offsetY) / scale,
        width: logo.width / scale,
        height: logo.height / scale,
    };
    if (crop.x < 0 || crop.y < 0 || crop.x + crop.width > naturalWidth + 0.001 || crop.y + crop.height > naturalHeight + 0.001) return null;
    return crop;
}
