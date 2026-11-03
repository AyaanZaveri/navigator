package app.navigator.android

class PlaybackBrightness(private val window: Window) {
    interface Window {
        fun read(): Float
        fun write(value: Float)
    }
    private var original: Float? = null
    private var requested: Float? = null
    private var suspended = false

    fun begin(preferred: Float): Float {
        val actual = window.read()
        return set(requested ?: if (actual >= 0) actual else preferred)
    }
    fun set(value: Float): Float {
        if (!value.isFinite()) return requested ?: window.read()
        val next = value.coerceIn(0f, 1f)
        if (original == null) original = window.read()
        requested = next
        if (!suspended) window.write(next)
        return next
    }
    fun suspend() {
        if (requested != null && !suspended) window.write(-1f)
        suspended = true
    }
    fun systemChanged() = suspend()
    fun reapply() { suspended = false; requested?.let(window::write) }
    fun restore() {
        original?.let(window::write)
        original = null
        requested = null
    }
}
