package app.navigator.android

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.os.Bundle
import android.view.MotionEvent
import android.view.View
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.SeekBar

/** Transparent slider with official Lucide artwork and a 56dp touch target. */
class SideControlView(context: Context, private val change: (Float) -> Unit, private val mute: () -> Unit,
                      private val hold: () -> Unit, private val release: () -> Unit) : View(context) {
    private val paint = Paint(3)
    private val d = resources.displayMetrics.density
    private val sun = requireNotNull(context.getDrawable(R.drawable.lucide_sun))
    private val silent = requireNotNull(context.getDrawable(R.drawable.lucide_volume_x))
    private val quiet = requireNotNull(context.getDrawable(R.drawable.lucide_volume))
    private val medium = requireNotNull(context.getDrawable(R.drawable.lucide_volume_1))
    private val loud = requireNotNull(context.getDrawable(R.drawable.lucide_volume_2))
    private var volume = false
    private var muted = false
    private var dragging = false
    private var iconPress = false
    private var value = 0f
    private val slider = SliderDrag()
    // View's constructor may dispatch visibility before subclass fields initialize.
    @Suppress("UNNECESSARY_LATEINIT") // Needed to guard constructor-dispatched visibility callbacks.
    private lateinit var glide: PlayerBarGlide
    @Suppress("UNNECESSARY_LATEINIT")
    private lateinit var emphasis: PlayerBarGlide
    init {
        glide = PlayerBarGlide(this); emphasis = PlayerBarGlide(this)
        isFocusable = true; isClickable = true; visibility = GONE
    }
    fun update(volume: Boolean, value: Float, displayValue: Float, muted: Boolean, tracking: Boolean) {
        val reset = this.volume != volume || visibility != VISIBLE
        this.volume = volume; this.value = value; this.muted = muted
        if (reset) glide.snap(displayValue) else glide.to(if (tracking) displayValue else value)
        contentDescription = (if (volume) { if (muted) "Media volume muted, " else "Media volume, " } else "Brightness, ") +
            Math.round(value * 100) + " percent" + if (volume) ". Top icon toggles mute." else ""
        invalidate()
    }
    override fun onDraw(canvas: Canvas) {
        val x = width / 2f; val top = 44 * d; val bottom = height - 16 * d
        val icon = when { !volume -> sun; muted || value <= 0 -> silent; value < .34f -> quiet; value < .67f -> medium; else -> loud }
        val radius = Math.round(9 * d); val centerY = Math.round(22 * d); val centerX = Math.round(x)
        icon.setBounds(centerX - radius, centerY - radius, centerX + radius, centerY + radius); icon.draw(canvas)
        val halfWidth = (4 + emphasis.value()) * d
        paint.color = Color.argb(51, 255, 255, 255)
        canvas.drawRoundRect(x - halfWidth, top, x + halfWidth, bottom, halfWidth, halfWidth, paint)
        val at = bottom - (bottom - top) * glide.value()
        paint.color = Color.WHITE
        canvas.drawRoundRect(x - halfWidth, at, x + halfWidth, bottom, halfWidth, halfWidth, paint)
    }
    private fun drag(y: Float) = change(slider.move(y))
    @SuppressLint("ClickableViewAccessibility") // Range actions and mute click are implemented below.
    override fun onTouchEvent(e: MotionEvent): Boolean {
        if (e.actionMasked == MotionEvent.ACTION_DOWN) {
            iconPress = volume && e.y < 44 * d; dragging = !iconPress
            hold(); slider.begin(value, e.y, height - 60 * d, 0f)
            return true
        }
        if (e.pointerCount != 1 || e.actionMasked == MotionEvent.ACTION_CANCEL) {
            dragging = false; iconPress = false; release(); return true
        }
        if (e.actionMasked == MotionEvent.ACTION_MOVE && dragging) drag(e.y)
        if (e.actionMasked == MotionEvent.ACTION_UP) {
            if (iconPress && e.y < 44 * d) performClick()
            if (dragging) drag(e.y)
            dragging = false; iconPress = false; release()
        }
        return true
    }
    fun setHeld(held: Boolean) = emphasis.to(if (held && !iconPress) 1f else 0f)
    fun settle() { glide.to(value); setHeld(false) }
    override fun onVisibilityChanged(changedView: View, visibility: Int) {
        super.onVisibilityChanged(changedView, visibility)
        if (visibility != VISIBLE) {
            if (::glide.isInitialized) glide.cancel()
            if (::emphasis.isInitialized) emphasis.snap(0f)
            dragging = false; iconPress = false
        }
    }
    override fun onDetachedFromWindow() { glide.cancel(); emphasis.cancel(); super.onDetachedFromWindow() }
    override fun performClick(): Boolean { super.performClick(); if (volume) mute(); return true }
    @Suppress("DEPRECATION") // RangeInfo.obtain supports our API 24 minimum.
    override fun onInitializeAccessibilityNodeInfo(info: AccessibilityNodeInfo) {
        super.onInitializeAccessibilityNodeInfo(info)
        info.className = SeekBar::class.java.name
        info.rangeInfo = AccessibilityNodeInfo.RangeInfo.obtain(AccessibilityNodeInfo.RangeInfo.RANGE_TYPE_FLOAT, 0f, 1f, value)
        info.addAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_SET_PROGRESS)
        info.addAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_SCROLL_FORWARD)
        info.addAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_SCROLL_BACKWARD)
    }
    private fun finishAccessibleChange() { glide.snap(value); release() }
    override fun performAccessibilityAction(action: Int, args: Bundle?): Boolean {
        if (action == AccessibilityNodeInfo.AccessibilityAction.ACTION_SET_PROGRESS.id && args != null) {
            hold(); change(args.getFloat(AccessibilityNodeInfo.ACTION_ARGUMENT_PROGRESS_VALUE).coerceIn(0f, 1f))
            finishAccessibleChange(); return true
        }
        if (action == AccessibilityNodeInfo.ACTION_SCROLL_FORWARD || action == AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD) {
            hold(); change((value + if (action == AccessibilityNodeInfo.ACTION_SCROLL_FORWARD) .05f else -.05f).coerceIn(0f, 1f))
            finishAccessibleChange(); return true
        }
        return super.performAccessibilityAction(action, args)
    }
}
