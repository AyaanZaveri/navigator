export const WEB_STARTUP_WATCHDOG_MS = 8_000;

type VideoLike = EventTarget & { currentTime: number; paused: boolean; seeking: boolean };
type DocumentLike = EventTarget & { hidden: boolean };

/** Retry a web stream if a play attempt stalls before media time advances. */
export function installWebStartupWatchdog(
  element: VideoLike,
  onStall: () => void,
  document: DocumentLike,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let settled = false;
  let baseline = element.currentTime;

  const clearTimer = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const suspend = () => clearTimer();
  const arm = (resetBaseline = false) => {
    clearTimer();
    if (settled || document.hidden || element.paused || element.seeking) return;
    if (resetBaseline) baseline = element.currentTime;
    timer = setTimeout(() => {
      timer = undefined;
      if (settled) return;
      if (document.hidden || element.paused || element.seeking) return;
      settled = true;
      onStall();
    }, WEB_STARTUP_WATCHDOG_MS);
  };
  const onPlay = () => arm(true);
  const onTimeUpdate = () => {
    if (!element.seeking && element.currentTime > baseline + 0.05) {
      settled = true;
      clearTimer();
    }
  };
  const onSeeking = () => suspend();
  const onSeeked = () => { baseline = element.currentTime; arm(); };
  const onPause = () => suspend();
  const onVisibility = () => {
    if (document.hidden) suspend();
    else arm(true);
  };

  element.addEventListener("play", onPlay);
  element.addEventListener("playing", onPlay);
  element.addEventListener("timeupdate", onTimeUpdate);
  element.addEventListener("seeking", onSeeking);
  element.addEventListener("seeked", onSeeked);
  element.addEventListener("pause", onPause);
  document.addEventListener("visibilitychange", onVisibility);
  arm();
  return () => {
    settled = true;
    clearTimer();
    element.removeEventListener("play", onPlay);
    element.removeEventListener("playing", onPlay);
    element.removeEventListener("timeupdate", onTimeUpdate);
    element.removeEventListener("seeking", onSeeking);
    element.removeEventListener("seeked", onSeeked);
    element.removeEventListener("pause", onPause);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
