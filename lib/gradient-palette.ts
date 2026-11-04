export function rgbToLab([r, g, b]: readonly number[]): number[] {
    const linear = (v: number) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
    const lr = linear(r), lg = linear(g), lb = linear(b);
    const l = Math.cbrt(.4122214708 * lr + .5363325363 * lg + .0514459929 * lb);
    const m = Math.cbrt(.2119034982 * lr + .6806995451 * lg + .1073969566 * lb);
    const s = Math.cbrt(.0883024619 * lr + .2817188376 * lg + .6299787005 * lb);
    return [.2104542553 * l + .793617785 * m - .0040720468 * s,
        1.9779984951 * l - 2.428592205 * m + .4505937099 * s,
        .0259040371 * l + .7827717662 * m - .808675766 * s];
}

export function labToRgb(lab: ArrayLike<number>): number[] {
    const [l, a, b] = [lab[0], lab[1], lab[2]];
    const x = (l + .3963377774 * a + .2158037573 * b) ** 3;
    const y = (l - .1055613458 * a - .0638541728 * b) ** 3;
    const z = (l - .0894841775 * a - 1.291485548 * b) ** 3;
    return [4.0767416621 * x - 3.3077115913 * y + .2309699292 * z,
        -1.2684380046 * x + 2.6097574011 * y - .3413193965 * z,
        -.0041960863 * x - .7034186147 * y + 1.707614701 * z].map(v => {
        const encoded = v <= .0031308 ? 12.92 * v : 1.055 * Math.max(0, v) ** (1 / 2.4) - .055;
        return Math.max(0, Math.min(1, encoded));
    });
}

/** Mutable, allocation-free samples. Smoothstep matches the existing Aurora
 * transition; retargeting samples the current frame before changing endpoints. */
export function createGradientTransition(initial: Float32Array) {
    const value = new Float32Array(initial), from = new Float32Array(initial), to = new Float32Array(initial);
    let start = 0, duration = 0, active = false;
    function sample(now: number) {
        if (!active) return value;
        const t = Math.min(1, Math.max(0, (now - start) / duration));
        const eased = t * t * (3 - 2 * t);
        for (let i = 0; i < value.length; i++) value[i] = from[i] + (to[i] - from[i]) * eased;
        active = t < 1;
        return value;
    }
    return {
        value, sample,
        get active() { return active; },
        target(next: Float32Array, now: number, milliseconds: number) {
            sample(now); from.set(value); to.set(next); start = now;
            duration = Math.max(0, milliseconds); active = duration > 0;
            if (!active) value.set(to);
        },
        finish() { value.set(to); active = false; },
    };
}

export function hexRgb(hex: string): number[] {
    const raw = hex.replace("#", "");
    const full = raw.length === 3 ? raw.split("").map(c => c + c).join("") : raw;
    const value = /^[\da-f]{6}$/i.test(full) ? parseInt(full, 16) : 0;
    return [(value >> 16) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

/** Theme-specific luminance keeps the wash subdued; the artwork supplies hue. */
export function homeWash(ramp: Float32Array, count: number, light: boolean, out: Float32Array) {
    for (let i = 0; i < 2; i++) {
        const offset = (i ? count - 1 : 0) * 3;
        const scale = light ? (i ? .1 : .2) : (i ? .3 : .65);
        const rgb = labToRgb([light ? (i ? .98 : .96) : (i ? .24 : .32), ramp[offset + 1] * scale, ramp[offset + 2] * scale]);
        out.set(rgb, i * 3);
    }
    return out;
}

/** Low-resolution, event-driven fallback. The WebGL shader uses this same
 * radial geometry and compositing order, including the solid theme base. */
export function paintHomeWash(context: CanvasRenderingContext2D, colors: Float32Array, light: boolean, height: number) {
    const w = context.canvas.width, h = context.canvas.height;
    context.clearRect(0, 0, w, h);
    context.fillStyle = light ? "#ffffff" : "#0a0a0a";
    context.fillRect(0, 0, w, h);
    for (const i of [1, 0]) {
        const x = i ? w : 0, y = light || !i ? 0 : h * .1;
        const rx = w * (light ? (i ? .8 : .9) : (i ? .9 : 1));
        const ry = light ? h * ((i ? 384 : 448) / Math.max(1, height)) : h * (i ? .55 : .65);
        context.save();
        context.translate(x, y); context.scale(rx, ry);
        const gradient = context.createRadialGradient(0, 0, 0, 0, 0, 1);
        const rgb = Array.from(colors.slice(i * 3, i * 3 + 3), value => Math.round(value * 255));
        gradient.addColorStop(0, `rgb(${rgb.join(",")})`);
        gradient.addColorStop(1, `rgba(${rgb.join(",")},0)`);
        context.fillStyle = gradient;
        context.fillRect(-2, -2, 4, 4);
        context.restore();
    }
}
