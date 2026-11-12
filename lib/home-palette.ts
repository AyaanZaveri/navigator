export const HOME_COLORS = ["#047857", "#ecfdf5", "#a7f3d0", "#34d399"];
export const LIGHT_HOME_COLORS = ["#6ee7b7", "#ecfdf5", "#d1fae5", "#a7f3d0"];

function tint(hex: string, amount: number) {
    return "#" + [1, 3, 5].map(offset => {
        const value = parseInt(hex.slice(offset, offset + 2), 16);
        return Math.round(value + (255 - value) * amount).toString(16).padStart(2, "0");
    }).join("");
}

export function homePalette(colors: readonly string[] | null, light: boolean): string[] {
    if (!colors?.length) return light ? LIGHT_HOME_COLORS : HOME_COLORS;
    const [a, b = a, c = a] = colors;
    return light
        ? [tint(a, .4), tint(a, .94), tint(b, .72), tint(c, .5)]
        : [a, tint(a, .88), tint(b, .4), c];
}

export interface HomeArtwork { primary?: string; fallback?: string }
export interface HomePaletteSnapshot { colors: string[] | null; duration: number }

/** Commands are independent of React renders. Each accepted selection owns its
 * result, so streamed data and obsolete requests cannot reverse user intent. */
export function createHomePaletteScene(
    load: (_primary?: string, _fallback?: string) => Promise<string[] | null>,
    clock = {
        now: () => performance.now(),
        // Window timer methods cannot be borrowed as methods of this object:
        // `clock.set(...)` otherwise passes the clock as their native receiver.
        set: (callback: () => void, delay: number) => setTimeout(callback, delay),
        clear: (timer: ReturnType<typeof setTimeout> | undefined) => clearTimeout(timer),
    },
) {
    let snapshot: HomePaletteSnapshot = { colors: null, duration: 0 };
    const listeners = new Set<() => void>();
    let active = false, interacted = false, epoch = 0, selection = 0, opened = 0;
    let initial: { source: HomeArtwork } | null = null;
    let owner: symbol | null = null;
    let hoverOwner: symbol | null = null;
    let hoverTimer: ReturnType<typeof setTimeout> | undefined;
    let initialTimer: ReturnType<typeof setTimeout> | undefined;

    function publish(colors: string[], duration: number) {
        snapshot = { colors, duration };
        listeners.forEach(listener => listener());
    }
    function opening() {
        if (!active || interacted || !initial) return;
        const registration = initial, generation = epoch;
        void load(registration.source.primary, registration.source.fallback).then(colors => {
            if (!colors || !active || generation !== epoch || initial !== registration || interacted) return;
            clock.clear(initialTimer);
            initialTimer = clock.set(() => {
                initialTimer = undefined;
                if (active && generation === epoch && initial === registration && !interacted && !hoverTimer) publish(colors, 1200);
            }, Math.max(0, 1500 - (clock.now() - opened)));
        }).catch(() => {});
    }
    function select(nextOwner: symbol, source: HomeArtwork, duration: number) {
        if (!active) return;
        interacted = true;
        owner = nextOwner;
        const request = ++selection, generation = epoch;
        clock.clear(initialTimer);
        if (!source.primary && !source.fallback) return;
        void load(source.primary, source.fallback).then(colors => {
            if (colors && active && generation === epoch && request === selection && owner === nextOwner) publish(colors, duration);
        }).catch(() => {});
    }
    return {
        subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
        getSnapshot: () => snapshot,
        start() { active = true; opened = clock.now(); epoch++; opening(); },
        stop() {
            active = false; epoch++; selection++;
            clock.clear(hoverTimer); clock.clear(initialTimer); hoverTimer = initialTimer = undefined;
        },
        registerInitial(source: HomeArtwork, resetInteraction = false) {
            // A new search result set takes priority over the previous set's
            // hover/focus requests, while retaining its colors during loading.
            if (resetInteraction) {
                interacted = false; owner = null; hoverOwner = null; selection++;
                clock.clear(hoverTimer); hoverTimer = undefined;
                clock.clear(initialTimer); initialTimer = undefined;
            }
            const registration = { source };
            initial = registration; opening();
            return () => { if (initial === registration) { initial = null; clock.clear(initialTimer); } };
        },
        hover(nextOwner: symbol, source: HomeArtwork) {
            clock.clear(hoverTimer);
            hoverOwner = nextOwner;
            hoverTimer = clock.set(() => { hoverTimer = undefined; select(nextOwner, source, 280); }, 90);
        },
        leave(nextOwner: symbol) {
            if (hoverOwner === nextOwner) {
                clock.clear(hoverTimer); hoverTimer = undefined; hoverOwner = null;
                if (!interacted) opening();
            }
        },
        focus(nextOwner: symbol, source: HomeArtwork) {
            clock.clear(hoverTimer); hoverTimer = undefined;
            select(nextOwner, source, 0);
        },
        release(nextOwner: symbol) {
            this.leave(nextOwner);
            if (owner === nextOwner) { owner = null; selection++; }
        },
    };
}

export type HomePaletteScene = ReturnType<typeof createHomePaletteScene>;
