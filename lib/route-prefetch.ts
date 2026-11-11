type Warm = () => void;

export function routePrefetchAllowed(): boolean {
    if (typeof navigator === "undefined" || typeof document === "undefined") return false;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    return !document.hidden && navigator.onLine !== false && !connection?.saveData
        && !["slow-2g", "2g"].includes(connection?.effectiveType ?? "");
}

/** Budget launches, not network completion: Next owns its prefetch task queue.
 * A canceled hover never launches; recently warmed destinations are shared by
 * cards, their title links and search suggestions without retaining page data. */
export function createRoutePrefetchScheduler(options: {
    allowed: () => boolean;
    now: () => number;
    later: (_callback: () => void, _delay: number) => ReturnType<typeof setTimeout>;
    cancel: (_timer: ReturnType<typeof setTimeout>) => void;
}) {
    const recent = new Map<string, number>();
    let nextLaunch = 0;
    let pending = 0;
    return (href: string, warm: Warm) => {
        if (!href.startsWith("/") || href.startsWith("//") || href.startsWith("/api/") || !options.allowed() || pending >= 8) return () => {};
        let active = true;
        pending++;
        const finish = () => { if (active) { active = false; pending--; } };
        const run = () => {
            if (!active) return;
            const now = options.now();
            if (!options.allowed() || (recent.get(href) ?? -Infinity) > now) { finish(); return; }
            if (now < nextLaunch) { timer = options.later(run, nextLaunch - now); return; }
            finish();
            nextLaunch = now + 500;
            recent.delete(href);
            recent.set(href, now + 30_000);
            if (recent.size > 64) recent.delete(recent.keys().next().value!);
            try { warm(); } catch { recent.delete(href); }
        };
        let timer = options.later(run, 120);
        return () => { options.cancel(timer); finish(); };
    };
}

export const scheduleRoutePrefetch = createRoutePrefetchScheduler({
    allowed: routePrefetchAllowed, now: () => performance.now(),
    later: (callback, delay) => setTimeout(callback, delay), cancel: timer => clearTimeout(timer),
});
