export type LogoTone = "light" | "dark";
type Rectangle = { left: number; top: number; width: number; height: number };

function linearChannel(channel: number): number {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(red: number, green: number, blue: number): number {
    return 0.2126 * linearChannel(red) + 0.7152 * linearChannel(green) + 0.0722 * linearChannel(blue);
}

// Contrast crossover for the two existing SVG gradients, rather than black/white.
const darkLogo = (luminance(24, 163, 141) + luminance(17, 135, 119)) / 2;
const lightLogo = (luminance(168, 244, 228) + luminance(54, 204, 176)) / 2;
export const LOGO_LUMINANCE_THRESHOLD = Math.sqrt((darkLogo + 0.05) * (lightLogo + 0.05)) - 0.05;
const HYSTERESIS = 0.03;

export function chooseLogoTone(brightness: number, current: LogoTone | null = null): LogoTone {
    if (current === "dark" && brightness >= LOGO_LUMINANCE_THRESHOLD - HYSTERESIS) return "dark";
    if (current === "light" && brightness <= LOGO_LUMINANCE_THRESHOLD + HYSTERESIS) return "light";
    return brightness > LOGO_LUMINANCE_THRESHOLD ? "dark" : "light";
}

export function averageLuminance(pixels: ArrayLike<number>): number | null {
    let total = 0;
    let weight = 0;
    for (let index = 0; index + 3 < pixels.length; index += 4) {
        const alpha = pixels[index + 3] / 255;
        total += luminance(pixels[index], pixels[index + 1], pixels[index + 2]) * alpha;
        weight += alpha;
    }
    return weight > 0 ? total / weight : null;
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
