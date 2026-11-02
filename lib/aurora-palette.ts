export const DEFAULT_AURORA_COLORS = ["#6FE3F5", "#2FB8D6", "#4EA6BF"];

interface AuroraSwatch {
    hex: string;
    population: number;
}

/** Keep the artwork's hues, but avoid nearly black light on a dark surface. */
export function selectAuroraColors(swatches: AuroraSwatch[]): string[] | null {
    const unique = Array.from(new Map(swatches.map(swatch => [swatch.hex.toLowerCase(), swatch])).values());
    const population = Math.max(1, ...unique.map(swatch => swatch.population || 0));
    const colors = unique.flatMap(swatch => {
        if (!/^#[0-9a-f]{6}$/i.test(swatch.hex)) return [];
        const rgb = [1, 3, 5].map(offset => parseInt(swatch.hex.slice(offset, offset + 2), 16) / 255);
        const high = Math.max(...rgb), low = Math.min(...rgb);
        const lightness = (high + low) / 2;
        const chroma = high - low;
        const saturation = chroma === 0 ? 0 : chroma / (1 - Math.abs(2 * lightness - 1));
        const target = Math.max(0.48, Math.min(0.72, lightness));
        // An affine RGB adjustment preserves hue and HSL saturation.
        const targetChroma = (1 - Math.abs(2 * target - 1)) * saturation;
        const adjusted = rgb.map(channel => chroma === 0 ? target
            : (channel - low) / chroma * targetChroma + target - targetChroma / 2);
        const hex = "#" + adjusted.map(channel => Math.round(channel * 255).toString(16).padStart(2, "0")).join("");
        const usable = high > 0.15 && low < 0.92;
        const score = (usable ? 1 : 0) + saturation * 0.65
            + (1 - Math.abs(lightness - 0.55)) * 0.2 + (swatch.population || 0) / population * 0.15;
        return [{ hex, score }];
    }).sort((a, b) => b.score - a.score);
    if (!colors.length) return null;
    return [colors[0].hex, colors[1]?.hex ?? colors[0].hex, colors[2]?.hex ?? colors[0].hex];
}
