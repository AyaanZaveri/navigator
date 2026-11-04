package app.navigator.android

class SideSwipeGesture(private val density: Float, slop: Float) {
    enum class Mode { NONE, BRIGHTNESS, VOLUME, SCRUB }
    private val slop = maxOf(slop, 12 * density)
    private var startX = 0f
    private var startY = 0f
    private var span = 1f
    private var eligible = false
    private var horizontal = false
    private var started = false
    private var mode = Mode.NONE
    private var candidate = Mode.NONE
    private val slider = SliderDrag()

    fun begin(x: Float, y: Float, width: Float, height: Float, top: Float, bottom: Float,
              leftEdge: Float, rightEdge: Float, allowScrub: Boolean): Mode {
        cancel()
        startX = x; startY = y
        span = maxOf(200 * density, height * .5f)
        eligible = x >= 0 && x <= width && y >= top && y < bottom
        if (!eligible) return candidate
        // Preserve Android Back ownership at physical edges.
        horizontal = allowScrub && x >= maxOf(24 * density, leftEdge) && x <= width - maxOf(24 * density, rightEdge)
        candidate = when { x < width / 3 -> Mode.BRIGHTNESS; x > width * 2 / 3 -> Mode.VOLUME; else -> Mode.NONE }
        return candidate
    }
    fun move(x: Float, y: Float): Mode {
        if (!eligible || mode != Mode.NONE) return mode
        val dx = kotlin.math.abs(x - startX)
        val dy = kotlin.math.abs(y - startY)
        if (dy > slop && dy > dx * 1.25f) {
            mode = candidate
            if (mode == Mode.NONE) eligible = false
        } else if (dx > slop && dx > dy * 1.25f) {
            mode = if (horizontal) Mode.SCRUB else Mode.NONE
            if (mode == Mode.NONE) eligible = false
        }
        return mode
    }
    fun canCapture() = eligible && (horizontal || candidate != Mode.NONE)
    fun mode() = mode
    fun value(initial: Float, y: Float, minimum: Float): Float {
        if (!started) { slider.begin(initial, startY, span, minimum); started = true }
        return slider.move(y)
    }
    fun cancel() { eligible = false; horizontal = false; started = false; mode = Mode.NONE; candidate = Mode.NONE }
}
