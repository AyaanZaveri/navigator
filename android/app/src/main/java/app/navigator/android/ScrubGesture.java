package app.navigator.android;

/** Incremental movement avoids a seek jump when the finger changes height. */
final class ScrubGesture {
    private double target;
    private long duration;
    private float lastX, width, height;
    void begin(long position, long duration, float x, float width, float height) {
        this.duration = Math.max(0, duration); this.target = Math.max(0, Math.min(position, this.duration));
        lastX = x; this.width = Math.max(1, width); this.height = Math.max(1, height);
    }
    long move(float x, float y) {
        double fraction = Math.max(0, Math.min(1, y / height));
        double span = Math.min(duration, 600_000) * (.05 + .95 * fraction * fraction);
        target = Math.max(0, Math.min(duration, target + (x - lastX) / width * span));
        lastX = x;
        return Math.round(target);
    }
}
