package app.navigator.android;

/** Bound visible-video sampling while keeping expensive work below 25% duty. */
final class GlassTiming {
    static final long IDLE_MS = 250;
    static long delayAfter(long workMs) {
        long work = Math.max(0, workMs);
        long period = Math.max(84, work * 4); // At most ~12 samples/second.
        return period - work;
    }
}
