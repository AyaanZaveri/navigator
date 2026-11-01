package app.navigator.android;

import java.util.function.LongPredicate;

/** One image per second in the already buffered, nearby playback window. */
final class ThumbnailWarmPlan {
    static final long INTERVAL_MS = 1000;
    static long bucket(long position) { return Math.max(0, Math.round(position / (double)INTERVAL_MS) * INTERVAL_MS); }
    static Long next(long position, long buffered, long duration, LongPredicate cached) {
        long end = Math.min(Math.min(buffered - INTERVAL_MS, duration - INTERVAL_MS), position + 120_000);
        for (long at = bucket(position); at <= end; at += INTERVAL_MS) {
            if (!cached.test(at)) return at;
        }
        return null;
    }
    static long restAfter(long workMs) { return Math.max(200, Math.max(0, workMs) * 3); }
}
