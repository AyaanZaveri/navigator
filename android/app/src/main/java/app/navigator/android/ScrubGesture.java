package app.navigator.android;

/** Incremental movement avoids a seek jump when the finger changes height. */
final class ScrubGesture {
    private double target, speed = 1;
    double speed() { return speed; }
    private long duration;
    private float lastX, width, height;
    void begin(long position, long duration, float x, float width, float height) {
        speed = 1; this.duration = Math.max(0, duration); this.target = Math.max(0, Math.min(position, this.duration));
        lastX = x; this.width = Math.max(1, width); this.height = Math.max(1, height);
    }
    long move(float x, float y) {
        double fraction = Math.max(0, Math.min(1, y / height));
        speed = .05 + .95 * fraction * fraction;
        double span = Math.min(duration, 600_000) * speed;
        target = Math.max(0, Math.min(duration, target + (x - lastX) / width * span));
        lastX = x;
        return Math.round(target);
    }
}
