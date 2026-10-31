package app.navigator.android;

/** Direction locks once; changing height during a scrub never becomes a side control. */
final class SideSwipeGesture {
    enum Mode { NONE, BRIGHTNESS, VOLUME, SCRUB }
    private final float density, slop;
    private Mode candidate = Mode.NONE, mode = Mode.NONE;
    private float startX, startY, span;
    private boolean eligible, horizontal;

    SideSwipeGesture(float density, float slop) {
        this.density = density; this.slop = Math.max(slop, 12 * density);
    }
    Mode begin(float x, float y, float width, float height, float top, float bottom,
               float leftEdge, float rightEdge, boolean allowScrub) {
        cancel(); startX = x; startY = y; span = Math.max(200 * density, height * .5f);
        eligible = x >= 0 && x <= width && y >= top && y < bottom;
        if (!eligible) return candidate;
        // Vertical controls reach the physical edges. Horizontal gestures starting
        // in Android's Back region stay with the system; no exclusion rectangles.
        horizontal = allowScrub && x >= Math.max(24 * density, leftEdge)
            && x <= width - Math.max(24 * density, rightEdge);
        if (x < width / 3) candidate = Mode.BRIGHTNESS;
        else if (x > width * 2 / 3) candidate = Mode.VOLUME;
        return candidate;
    }
    Mode move(float x, float y) {
        if (mode != Mode.NONE || !eligible) return mode;
        float dx = Math.abs(x - startX), dy = Math.abs(y - startY);
        if (dy > slop && dy > dx * 1.25f) {
            mode = candidate;
            if (mode == Mode.NONE) eligible = false;
        } else if (dx > slop && dx > dy * 1.25f) {
            mode = horizontal ? Mode.SCRUB : Mode.NONE;
            eligible = mode != Mode.NONE;
        }
        return mode;
    }
    boolean canCapture() { return eligible && (horizontal || candidate != Mode.NONE); }
    Mode mode() { return mode; }
    float value(float initial, float y, float minimum) {
        return Math.max(minimum, Math.min(1, initial + (startY - y) / span));
    }
    void cancel() { eligible = horizontal = false; candidate = mode = Mode.NONE; }
}
