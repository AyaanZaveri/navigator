package app.navigator.android

import android.animation.ValueAnimator
import android.os.Build
import android.os.SystemClock
import android.provider.Settings
import android.view.View
import android.view.animation.PathInterpolator

/** Small ease-out for native bar rendering; no hardware/player callbacks. */
class PlayerBarGlide(private val view: View) {
    private val visual = SliderVisualValue { EASE.getInterpolation(it.toFloat()).toDouble() }
    private var posted = false
    private val frame = Runnable {
        posted = false
        if (view.isAttachedToWindow && view.visibility == View.VISIBLE) {
            visual.sample(SystemClock.uptimeMillis())
            view.invalidate()
            if (visual.running()) schedule()
        }
    }
    fun to(target: Float) {
        val now = SystemClock.uptimeMillis()
        val scale = durationScale()
        if (scale <= 0 || view.visibility != View.VISIBLE || !view.isAttachedToWindow) { snap(target); return }
        visual.retarget(target, now, Math.round(100 * scale).toLong())
        view.invalidate()
        if (visual.running()) schedule()
    }
    fun snap(value: Float) { cancel(); visual.snap(value, SystemClock.uptimeMillis()); view.invalidate() }
    fun value() = visual.value()
    fun cancel() { view.removeCallbacks(frame); posted = false }
    private fun schedule() { if (!posted) { posted = true; view.postOnAnimation(frame) } }
    private fun durationScale(): Float {
        if (Build.VERSION.SDK_INT >= 33) return ValueAnimator.getDurationScale()
        return try { Settings.Global.getFloat(view.context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) }
        catch (_: SecurityException) { 1f }
    }
    companion object { private val EASE = PathInterpolator(.23f, 1f, .32f, 1f) }
}
