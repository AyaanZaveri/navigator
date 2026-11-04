import { selectAuroraColors } from "./aurora-palette";

interface Swatch { hex: string; population: number }
interface Color extends Swatch {
    rgb: number[];
    hue: number;
    saturation: number;
    lightness: number;
    chromatic: boolean;
}
interface Family {
    population: number;
    rgb: number[];
    hueX: number;
    hueY: number;
    chromatic: boolean;
    neutralBand: number;
}

function color(swatch: Swatch): Color | null {
    if (!/^#[0-9a-f]{6}$/i.test(swatch.hex) || !Number.isFinite(swatch.population) || swatch.population <= 0) return null;
    const rgb = [1, 3, 5].map(offset => parseInt(swatch.hex.slice(offset, offset + 2), 16) / 255);
    const high = Math.max(...rgb), low = Math.min(...rgb), chroma = high - low;
    const lightness = (high + low) / 2;
    const saturation = chroma === 0 ? 0 : chroma / (1 - Math.abs(2 * lightness - 1));
    const sector = chroma === 0 ? 0 : high === rgb[0] ? (rgb[1] - rgb[2]) / chroma
        : high === rgb[1] ? (rgb[2] - rgb[0]) / chroma + 2 : (rgb[0] - rgb[1]) / chroma + 4;
    return { hex: swatch.hex, population: swatch.population, rgb,
        hue: ((sector * 60 + 360) % 360) * Math.PI / 180, saturation, lightness,
        chromatic: chroma >= .04 && saturation >= .18 && lightness > .08 && lightness < .92 };
}

const neutralBand = (lightness: number) => lightness < .12 ? 0 : lightness > .9 ? 2 : 1;

/** Quantizer populations describe actual artwork coverage; generated Vibrant
 * swatches can have zero population. Group nearby hues across brightness levels
 * so a shaded blue backdrop is not outvoted by one flat yellow logo/character.
 * Returns [dominant, supporting, accent], with no invented accent for neutral art.
 * https://github.com/Vibrant-Colors/node-vibrant/blob/main/docs/reference/vibrant-color/classes/swatch.md
 */
export function selectHomeColors(swatches: readonly Swatch[]): string[] | null {
    const colors = swatches.map(color).filter((value): value is Color => value !== null)
        .sort((a, b) => b.population - a.population || a.hex.localeCompare(b.hex));
    const families: Family[] = [];
    for (const candidate of colors) {
        let closest: Family | undefined, distance = Infinity;
        for (const family of families) {
            if (family.chromatic !== candidate.chromatic) continue;
            if (!candidate.chromatic) {
                if (family.neutralBand === neutralBand(candidate.lightness)) { closest = family; break; }
                continue;
            }
            const hue = Math.atan2(family.hueY, family.hueX);
            const difference = Math.acos(Math.max(-1, Math.min(1, Math.cos(candidate.hue - hue))));
            if (difference <= Math.PI / 6 && difference < distance) { closest = family; distance = difference; }
        }
        if (!closest) {
            closest = { population: 0, rgb: [0, 0, 0], hueX: 0, hueY: 0,
                chromatic: candidate.chromatic, neutralBand: neutralBand(candidate.lightness) };
            families.push(closest);
        }
        closest.population += candidate.population;
        candidate.rgb.forEach((channel, i) => { closest.rgb[i] += channel * candidate.population; });
        closest.hueX += Math.cos(candidate.hue) * candidate.population;
        closest.hueY += Math.sin(candidate.hue) * candidate.population;
    }
    const total = colors.reduce((sum, value) => sum + value.population, 0);
    const ranked = families.map(family => {
        const hex = "#" + family.rgb.map(sum => Math.round(sum / family.population * 255).toString(16).padStart(2, "0")).join("");
        const representative = color({ hex, population: family.population })!;
        // Letterboxing and neutral whitespace should not drown out the artwork,
        // but remain valid fallbacks when a picture is actually monochrome.
        const weight = family.chromatic ? 1 : family.neutralBand === 1 ? .22 : .06;
        return { ...representative, score: family.population * weight };
    }).sort((a, b) => b.score - a.score || a.hex.localeCompare(b.hex));
    const dominant = ranked[0];
    if (!dominant) return null;
    const significant = ranked.filter(value => value !== dominant && value.population / total >= .02);
    const supporting = significant[0] ?? dominant;
    const accent = significant.filter(value => value.chromatic)
        .sort((a, b) => b.saturation * Math.sqrt(b.population / total) - a.saturation * Math.sqrt(a.population / total))[0] ?? dominant;
    // Reuse the existing hue-preserving brightness limits, without letting its
    // vibrancy ranking reorder our population-based choice.
    return [dominant, supporting, accent].map(value => selectAuroraColors([value])![0]);
}
