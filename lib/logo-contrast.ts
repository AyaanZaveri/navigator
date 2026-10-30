/** Ignore translucent texture and measure the solid lettering in a wordmark. */
export function isDarkWordmark(pixels: ArrayLike<number>): boolean {
    let luminance = 0;
    let count = 0;
    const linear = (channel: number) => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    };

    for (let index = 0; index < pixels.length; index += 4) {
        if (pixels[index + 3] < 192) continue;
        luminance += 0.2126 * linear(pixels[index])
            + 0.7152 * linear(pixels[index + 1])
            + 0.0722 * linear(pixels[index + 2]);
        count++;
    }

    return count > 0 && luminance / count < 0.18;
}
