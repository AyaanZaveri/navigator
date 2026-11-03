/** Subtitle evidence uses seconds, with an SRT/VTT string fallback for old history. */
export function formatSceneTime(timestamp?: number, formatted?: string): string | undefined {
  let seconds = timestamp;
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) {
    const match = /^(?:(\d+):)?([0-5]?\d):([0-5]\d)(?:[.,]\d+)?$/.exec(formatted?.trim() ?? "");
    if (!match) return;
    seconds = Number(match[1] || 0) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  }
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600), minutes = Math.floor(total % 3600 / 60), remainder = total % 60;
  return [hours ? `${hours}h` : "", minutes || hours ? `${minutes}m` : "", `${remainder}s`].filter(Boolean).join(" ");
}
