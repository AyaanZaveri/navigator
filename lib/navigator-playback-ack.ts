export type ActionOutcome = { success: boolean; status: "completed" | "requested" | "failed" | "cancelled"; message: string };
export const NAVIGATOR_PLAYBACK_EVENT = "navigatorplaybackstate";

/** Subscribe before dispatching playback, and only accept events for this request. */
export function acknowledgePlayback(target: EventTarget, actionId: string, start: () => void, signal: AbortSignal, timeoutMs = 30_000): Promise<ActionOutcome> {
    return new Promise(resolve => {
        const finish = (outcome: ActionOutcome) => {
            clearTimeout(timer);
            target.removeEventListener(NAVIGATOR_PLAYBACK_EVENT, listener);
            signal.removeEventListener("abort", abort);
            resolve(outcome);
        };
        const listener = (event: Event) => {
            const detail = (event as CustomEvent).detail;
            if (detail?.actionId !== actionId) return;
            if (detail.state === "playing") finish({ success: true, status: "completed", message: "Playback has started." });
            if (detail.state === "error" || detail.state === "closed") finish({ success: false, status: "failed", message: detail.message || "Playback was closed before it started." });
        };
        const abort = () => finish({ success: false, status: "cancelled", message: "Stopped waiting for playback confirmation." });
        const timer = setTimeout(() => finish({ success: true, status: "requested", message: "Playback was requested, but the player has not confirmed it started yet." }), timeoutMs);
        if (signal.aborted) { abort(); return; }
        target.addEventListener(NAVIGATOR_PLAYBACK_EVENT, listener);
        signal.addEventListener("abort", abort, { once: true });
        try { start(); } catch (error) {
            finish({ success: false, status: "failed", message: error instanceof Error ? error.message : "Could not start playback." });
        }
    });
}
