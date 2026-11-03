package app.navigator.android

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorFilter
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.RadialGradient
import android.graphics.Rect
import android.graphics.Shader
import android.graphics.drawable.Drawable
import android.os.Build
import android.provider.Settings
import android.view.Gravity
import android.view.ViewGroup
import android.view.animation.PathInterpolator
import android.widget.FrameLayout
import android.widget.ImageView

/** Static light fields avoid full-screen animated blur; only transform/opacity animate. */
class LaunchBackdrop(context: Context) : FrameLayout(context) {
    private val mark = ImageView(context)
    private var closing = false

    init {
        background = Aurora()
        isClickable = true
        mark.setImageResource(R.drawable.ic_splash_ship)
        mark.importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
        val size = Math.round(288 * resources.displayMetrics.density)
        addView(mark, LayoutParams(size, size, Gravity.CENTER))
    }
    fun dismiss(animated: Boolean) {
        if (closing) { if (!animated) close(); return }
        closing = true
        if (!animated || !animationsEnabled(context)) { close(); return }
        val curve = PathInterpolator(.23f, 1f, .32f, 1f)
        mark.animate().scaleX(1.08f).scaleY(1.08f).setDuration(220).setInterpolator(curve).start()
        animate().alpha(0f).setDuration(220).setInterpolator(curve).withEndAction { close() }.start()
    }
    fun close() {
        closing = true
        mark.animate().cancel(); animate().cancel()
        (parent as? ViewGroup)?.removeView(this)
    }
    companion object {
        fun animationsEnabled(context: Context): Boolean = if (Build.VERSION.SDK_INT >= 26) ValueAnimator.areAnimatorsEnabled()
            else Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) > 0
    }
    private class Aurora : Drawable() {
        private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        private var base: Shader? = null
        private var top: Shader? = null
        private var bottom: Shader? = null
        private var halo: Shader? = null
        override fun onBoundsChange(bounds: Rect) {
            val w = bounds.width().toFloat(); val h = bounds.height().toFloat(); val shortEdge = minOf(w, h)
            if (shortEdge <= 0) return
            base = LinearGradient(0f, 0f, w, h, Color.rgb(10, 10, 10), Color.rgb(4, 47, 46), Shader.TileMode.CLAMP)
            top = RadialGradient(w * .5f, h * .05f, shortEdge * .9f, 0x8C14B8A6.toInt(), 0x0014B8A6, Shader.TileMode.CLAMP)
            bottom = RadialGradient(w * .5f, h * 1.05f, shortEdge * .95f, 0x800D9488.toInt(), 0x000D9488, Shader.TileMode.CLAMP)
            halo = RadialGradient(w * .5f, h * .5f, shortEdge * .4f, 0x2914B8A6, 0x0014B8A6, Shader.TileMode.CLAMP)
        }
        override fun draw(canvas: Canvas) {
            if (base == null) return
            paint.shader = base; canvas.drawRect(bounds, paint)
            paint.shader = top; canvas.drawRect(bounds, paint)
            paint.shader = bottom; canvas.drawRect(bounds, paint)
            paint.shader = halo; canvas.drawRect(bounds, paint)
        }
        override fun setAlpha(alpha: Int) { paint.alpha = alpha; invalidateSelf() }
        override fun setColorFilter(colorFilter: ColorFilter?) { paint.colorFilter = colorFilter; invalidateSelf() }
        @Deprecated("Deprecated by Android") override fun getOpacity() = PixelFormat.TRANSLUCENT
    }
}
