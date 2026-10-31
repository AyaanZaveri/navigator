package app.navigator.android;

/** Recognizes a single vertical side swipe; the caller owns platform settings. */
final class SideSwipeGesture {
    enum Mode { NONE, BRIGHTNESS, VOLUME }
    private final float density;
    private final float slop;
    private Mode candidate = Mode.NONE;
    private Mode mode = Mode.NONE;
    private float startX, startY, span;

    SideSwipeGesture(float density, float slop) {
        this.density = density;
        this.slop = Math.max(slop, 12 * density);
    }
    Mode begin(float x, float y, float width, float height, float top, float bottom, float leftEdge, float rightEdge) {
        cancel(); startX = x; startY = y; span = Math.max(200 * density, height * .5f);
        if (x < Math.max(24 * density, leftEdge) || x > width - Math.max(24 * density, rightEdge)
                || y < top || y >= bottom) return candidate;
        if (x < width * .3f) candidate = Mode.BRIGHTNESS;
        else if (x > width * .7f) candidate = Mode.VOLUME;
        return candidate;
    }
    Mode move(float x, float y) {
        if (mode != Mode.NONE || candidate == Mode.NONE) return mode;
        float dx = Math.abs(x - startX), dy = Math.abs(y - startY);
        if (dy > slop && dy > dx * 1.25f) mode = candidate;
        else if (dx > slop) candidate = Mode.NONE;
        return mode;
    }
    Mode candidate() { return candidate; }
    Mode mode() { return mode; }
    float value(float initial, float y, float minimum) {
        return Math.max(minimum, Math.min(1, initial + (startY - y) / span));
    }
    void cancel() { candidate = mode = Mode.NONE; }
}
