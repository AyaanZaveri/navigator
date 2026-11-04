package app.navigator.android

class ScrubGesture {
    private var target = 0.0
    private var speed = 1.0
    private var duration = 0L
    private var lastX = 0f
    private var width = 1f
    private var height = 1f

    fun begin(position: Long, duration: Long, x: Float, width: Float, height: Float) {
        speed = 1.0
        this.duration = duration.coerceAtLeast(0)
        target = position.coerceIn(0, this.duration).toDouble()
        lastX = x
        this.width = width.coerceAtLeast(1f)
        this.height = height.coerceAtLeast(1f)
    }
    fun move(x: Float, y: Float): Long {
        val fraction = (y / height).coerceIn(0f, 1f).toDouble()
        speed = .05 + .95 * fraction * fraction
        val span = minOf(duration, 600_000) * speed
        target = (target + (x - lastX) / width * span).coerceIn(0.0, duration.toDouble())
        lastX = x
        return Math.round(target)
    }
    fun speed() = speed
}
