import { animate } from "motion";
import { motionTokens } from "@/components/arc/motion-tokens";

/** The same boundary interaction runs in every browser and embedded webview. */
export function attachBackdropStretch(scroller: HTMLElement, options: {
    enabled: () => boolean;
    height: () => number;
    render: (_pull: number) => void;
}) {
    const originalOverscroll = scroller.style.overscrollBehaviorY;
    scroller.style.overscrollBehaviorY = "none";
    let pull = 0;
    let raw = 0;
    let velocity = 0;
    let lastTime = 0;
    let spring: { stop: () => void } | undefined;
    let touch: { x: number; y: number; startX: number; startY: number } | undefined;
    let destroyed = false;
    const dimension = () => Math.max(1, options.height());
    const resist = (distance: number) => distance * dimension() * 0.55 / (dimension() + distance * 0.55);
    const inverse = (distance: number) => dimension() * distance / (0.55 * Math.max(1, dimension() - distance));
    const render = (value: number) => {
        if (destroyed) return;
        pull = Math.max(0, value);
        options.render(pull);
    };
    const interrupt = () => {
        spring?.stop();
        spring = undefined;
        raw = inverse(pull);
    };
    const reset = () => {
        interrupt();
        raw = velocity = lastTime = 0;
        render(0);
    };
    const release = () => {
        if (!options.enabled() || pull === 0) { reset(); return; }
        spring?.stop();
        spring = animate(pull, 0, {
            ...motionTokens.spring.snappy,
            // Start moving home immediately; outward fling velocity would
            // make a released pull keep stretching before it turns around.
            velocity: Math.min(0, velocity),
            onUpdate: render,
            onComplete: () => { spring = undefined; raw = velocity = lastTime = 0; render(0); },
        });
    };
    // Positive input pulls down past the start; negative input reverses it.
    const move = (distance: number, event: { preventDefault: () => void }) => {
        if (!options.enabled() || !Number.isFinite(distance) || distance === 0) return false;
        const top = Math.max(0, scroller.scrollTop);
        if (pull === 0 && (distance <= 0 || distance <= top)) return false;
        event.preventDefault();
        interrupt();
        if (distance > 0) {
            const overshoot = Math.max(0, distance - top);
            if (top > 0) scroller.scrollTop = 0;
            raw += overshoot;
        } else {
            // Reversal consumes the visible stretch first, rather than making
            // the next gesture pay back a large accumulated wheel momentum.
            const remaining = pull + distance;
            raw = inverse(Math.max(0, remaining));
            if (remaining < 0) scroller.scrollTop = -remaining;
        }
        const next = resist(raw);
        const now = performance.now();
        velocity = lastTime && now > lastTime ? (next - pull) * 1000 / (now - lastTime) : 0;
        lastTime = now;
        render(next);
        return true;
    };
    const nestedScrollerConsumes = (target: EventTarget | null, delta: number) => {
        let element = target instanceof Element ? target : null;
        while (element && element !== scroller) {
            if (element.scrollHeight > element.clientHeight && /auto|scroll/.test(getComputedStyle(element).overflowY)) {
                const top = element.scrollTop;
                if (delta < 0 ? top > 0 : top + element.clientHeight < element.scrollHeight - 1) return true;
            }
            element = element.parentElement;
        }
        return false;
    };
    const wheel = (event: WheelEvent) => {
        if (event.ctrlKey) { reset(); return; }
        if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)
            || nestedScrollerConsumes(event.target, event.deltaY)) return;
        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? scroller.clientHeight : 1;
        // Wheel momentum has no portable finger-up event. Retarget home after
        // every impulse instead of holding the stretch until its long tail ends.
        if (move(-event.deltaY * unit, event)) release();
    };
    const start = (event: TouchEvent) => {
        if (event.touches.length !== 1) { touch = undefined; reset(); return; }
        const point = event.touches[0];
        touch = { x: point.clientX, y: point.clientY, startX: point.clientX, startY: point.clientY };
        interrupt();
        velocity = lastTime = 0;
    };
    const drag = (event: TouchEvent) => {
        if (!touch || event.touches.length !== 1) return;
        const point = event.touches[0];
        const dy = point.clientY - touch.y;
        const dx = point.clientX - touch.x;
        touch.x = point.clientX; touch.y = point.clientY;
        if (Math.abs(point.clientY - touch.startY) < 8 || Math.abs(dx) > Math.abs(dy)
            || nestedScrollerConsumes(event.target, -dy)) return;
        move(dy, event);
    };
    const end = () => { touch = undefined; release(); };
    const scroll = () => {
        // CSS prevents a second OS bounce. Clear any stale negative position
        // from a gesture already in flight when the route mounted.
        if (scroller.scrollTop < 0) scroller.scrollTop = 0;
        if (scroller.scrollTop > 0 && pull > 0) reset();
    };
    const listeners = { wheel, touchstart: start, touchmove: drag, touchend: end, touchcancel: end, scroll };
    for (const [name, listener] of Object.entries(listeners)) {
        scroller.addEventListener(name, listener as (_event: Event) => void, { passive: name !== "wheel" && name !== "touchmove" });
    }
    return {
        refresh() { if (!options.enabled()) reset(); else render(pull); },
        reset,
        destroy() {
            reset(); destroyed = true;
            for (const [name, listener] of Object.entries(listeners)) scroller.removeEventListener(name, listener as (_event: Event) => void);
            scroller.style.overscrollBehaviorY = originalOverscroll;
        },
    };
}
