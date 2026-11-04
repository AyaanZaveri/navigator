package app.navigator.android

import java.util.function.DoubleUnaryOperator

class SliderVisualValue(private val easing: DoubleUnaryOperator) {
    private var value = 0f
    private var from = 0f
    private var target = 0f
    private var started = 0L
    private var sampled = 0L
    private var duration = 0L

    fun snap(value: Float, now: Long) {
        if (!value.isFinite()) return
        this.value = value.coerceIn(0f, 1f)
        from = this.value; target = this.value
        started = now; sampled = now; duration = 0
    }
    fun retarget(target: Float, now: Long, duration: Long) {
        if (!target.isFinite()) return
        sample(now)
        val next = target.coerceIn(0f, 1f)
        if (duration <= 0) { snap(next, sampled); return }
        if (this.target == next && this.duration == duration) return
        from = value; this.target = next; started = sampled; this.duration = duration
    }
    fun sample(now: Long): Float {
        sampled = maxOf(sampled, now)
        val fraction = if (duration <= 0) 1.0 else minOf(1.0, (sampled - started).toDouble() / duration)
        value = if (fraction >= 1) target else from + (target - from) * easing.applyAsDouble(fraction).toFloat()
        return value
    }
    fun value() = value
    fun running() = value != target
}
