/** A small mutable palette track, sampled by the existing GPU loop. Retargeting
 * starts at the displayed color, so rapid navigation never jumps backwards. */
export function createAuroraTransition(stops: readonly string[], duration = 480) {
    const value = rgb(stops);
    const from = new Float32Array(value);
    let to: Float32Array = new Float32Array(value);
    let key = stops.join(",");
    let started = -Infinity;
    let active = false;
    function sample(now: number) {
        if (!active) return value;
        const progress = Math.min(1, Math.max(0, (now - started) / duration));
        const eased = progress * progress * (3 - 2 * progress);
        for (let i = 0; i < 9; i++) value[i] = from[i] + (to[i] - from[i]) * eased;
        active = progress < 1;
        return value;
    }
    return {
        value,
        get active() { return active; },
        sample,
        target(stops: readonly string[], now: number, immediate = false) {
            const nextKey = stops.join(",");
            if (key === nextKey) {
                if (immediate && active) { value.set(to); active = false; }
                return;
            }
            sample(now);
            key = nextKey;
            from.set(value);
            to = rgb(stops);
            started = now;
            active = !immediate && duration > 0;
            if (!active) value.set(to);
        },
    };
}

function rgb(stops: readonly string[]): Float32Array {
    const values = new Float32Array(9);
    for (let i = 0; i < 3; i++) {
        const hex = (stops[i] ?? stops[0] ?? "#000000").replace("#", "");
        const full = hex.length === 3 ? hex.split("").map(c => c + c).join("") : hex;
        const color = /^[\da-f]{6}$/i.test(full) ? parseInt(full, 16) : 0;
        values.set([(color >> 16) / 255, ((color >> 8) & 255) / 255, (color & 255) / 255], i * 3);
    }
    return values;
}
