package app.navigator.android

import android.annotation.SuppressLint
import android.app.Activity
import android.database.ContentObserver
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.WindowManager
import android.view.accessibility.AccessibilityManager
import android.widget.FrameLayout
import androidx.media3.common.util.UnstableApi
import org.json.JSONObject

/** Native gestures claim only directional drags, cancelling the WebView's tap. */
@UnstableApi
class PlayerGestureLayout(private val activity: Activity, private val enabled: () -> Boolean,
                          private val emit: (JSONObject) -> Unit) : FrameLayout(activity) {
    private val audio = activity.getSystemService(AudioManager::class.java)
    private val accessibility = activity.getSystemService(AccessibilityManager::class.java)
    private val density = resources.displayMetrics.density
    private val gesture = SideSwipeGesture(density, ViewConfiguration.get(activity).scaledTouchSlop.toFloat())
    private val scrub = ScrubGesture()
    private val side: SideControlView
    private var scrubFrameQueued = false
    private var scrubX = 0f
    private val scrubFrame = Runnable { scrubFrameQueued = false; if (scrubbing) sendScrub(true) }
    private val hideHud = Runnable { sideView().visibility = View.GONE }
    private val resumeBrightness = Runnable { brightnessResumeQueued = false; if (hasWindowFocus()) brightness.reapply() }
    private val waitBrightnessFrame = Runnable { postOnAnimation(resumeBrightness) }
    private var player: NativePlayer? = null
    private var topInset = 0f
    private var bottomInset = 0f
    private var leftEdge = 0f
    private var rightEdge = 0f
    private var downX = 0f
    private var controlsTop = Float.NaN
    private var initial = 0f
    private val brightness = PlaybackBrightness(object : PlaybackBrightness.Window {
        override fun read() = activity.window.attributes.screenBrightness
        override fun write(value: Float) {
            val attrs = activity.window.attributes
            // FULL is an absolute display request, independent of the system slider.
            attrs.screenBrightness = when (value) {
                1f -> WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_FULL
                0f -> WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_OFF
                else -> value
            }
            activity.window.attributes = attrs
        }
    })
    private val endpointHaptics = EndpointHaptics()
    private var sideInteraction = false
    private var brightnessResumeQueued = false
    private var minVolume = 0
    private var maxVolume = 0
    private var requestedVolume = 0
    private var shownMode = SideSwipeGesture.Mode.NONE
    private var ownsTouch = false
    private var controlsVisible = true
    private var scrubbing = false
    private var scrubSession = ""
    private var scrubTarget = 0L
    private val systemBrightness = object : ContentObserver(Handler(Looper.getMainLooper())) {
        override fun onChange(selfChange: Boolean) {
            brightness.systemChanged()
            if (hasWindowFocus()) scheduleBrightnessResume()
        }
    }
    init {
        side = SideControlView(activity, { applyProgress(shownMode, it) }, ::toggleMute,
            { removeCallbacks(hideHud); beginSideControl(shownMode) }, ::finishSideControl)
    }
    private fun sideView() = side
    private fun dp(value: Float) = Math.round(value * density)
    fun setPlayer(value: NativePlayer) { player = value }
    fun installHud() = addView(side, LayoutParams(dp(56f), dp(232f)))
    fun setGestureInsets(top: Float, bottom: Float, left: Float, right: Float) {
        topInset = top; bottomInset = bottom; leftEdge = left; rightEdge = right
    }
    fun setControlsTop(value: Float) { controlsTop = value }
    fun setControlsVisible(value: Boolean) {
        val revealed = value && !controlsVisible
        controlsVisible = value
        if (revealed && scrubbing) pauseGestures()
        if (!value && !scrubbing && available()) player?.warmPreview()
    }
    private fun available() = hasWindowFocus() && enabled() && accessibility?.isTouchExplorationEnabled != true
    private fun inSide(e: MotionEvent) = side.visibility == View.VISIBLE && e.x >= side.left && e.x < side.right && e.y >= side.top && e.y < side.bottom
    override fun onInterceptTouchEvent(e: MotionEvent): Boolean {
        when (e.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                ownsTouch = false; sideInteraction = false; endpointHaptics.end(); gesture.cancel()
                if (!available() || e.pointerCount != 1 || inSide(e)) return false
                val top = if (controlsVisible) maxOf(dp(64f).toFloat(), topInset + dp(64 * maxOf(1f, resources.configuration.fontScale))) else 0f
                val bottom = if (controlsVisible) {
                    if (controlsTop.isFinite()) controlsTop else height - maxOf(dp(136f).toFloat(), bottomInset + dp(112f))
                } else height.toFloat()
                gesture.begin(e.x, e.y, width.toFloat(), height.toFloat(), top, bottom, leftEdge, rightEdge, player?.canScrub() == true)
                downX = e.x
            }
            MotionEvent.ACTION_MOVE -> {
                if (!available() || e.pointerCount != 1) { gesture.cancel(); return false }
                val mode = gesture.move(e.x, e.y)
                if (mode == SideSwipeGesture.Mode.SCRUB && !scrubbing) {
                    val current = player ?: return false
                    scrubSession = current.session()
                    val duration = current.durationMs(); val at = current.positionMs()
                    scrubbing = current.beginScrub(scrubSession)
                    if (!scrubbing) { gesture.cancel(); return false }
                    hide(); scrubTarget = at; scrubX = e.x
                    scrub.begin(at, duration, downX, width.toFloat(), height.toFloat())
                }
                ownsTouch = mode != SideSwipeGesture.Mode.NONE
                if (ownsTouch && mode != SideSwipeGesture.Mode.SCRUB && !sideInteraction) beginSideControl(mode)
                return ownsTouch
            }
            MotionEvent.ACTION_POINTER_DOWN, MotionEvent.ACTION_CANCEL, MotionEvent.ACTION_UP -> gesture.cancel()
        }
        return false
    }
    override fun requestDisallowInterceptTouchEvent(disallow: Boolean) {
        if (disallow && gesture.canCapture()) return
        super.requestDisallowInterceptTouchEvent(disallow)
    }
    @SuppressLint("ClickableViewAccessibility") // Taps remain in WebView; only recognized drags are consumed.
    override fun onTouchEvent(e: MotionEvent): Boolean {
        if (!ownsTouch) return super.onTouchEvent(e)
        val action = e.actionMasked
        if (!available() || e.pointerCount != 1 || action == MotionEvent.ACTION_CANCEL) {
            finishScrub(false); gesture.cancel(); hide()
            if (action == MotionEvent.ACTION_CANCEL || action == MotionEvent.ACTION_UP) ownsTouch = false
            return true
        }
        if (action == MotionEvent.ACTION_MOVE || action == MotionEvent.ACTION_UP) adjust(e)
        if (action == MotionEvent.ACTION_UP) {
            finishScrub(true); ownsTouch = false; gesture.cancel(); finishSideControl()
        }
        return true
    }
    private fun adjust(e: MotionEvent) {
        val mode = gesture.mode()
        if (mode == SideSwipeGesture.Mode.SCRUB && scrubbing) {
            scrubTarget = scrub.move(e.x, e.y); scrubX = e.x
            if (!scrubFrameQueued) { scrubFrameQueued = true; postOnAnimation(scrubFrame) }
        } else if (mode != SideSwipeGesture.Mode.NONE) applyProgress(mode, gesture.value(normalized(initial), e.y, 0f))
    }
    private fun sendScrub(active: Boolean, commit: Boolean = false) {
        emit(NativePlayer.json("type", "scrub", "session", scrubSession, "active", active,
            "position", scrubTarget / 1000.0, "duration", (player?.durationMs() ?: 0) / 1000.0,
            "x", scrubX / density, "speed", scrub.speed(), "commit", commit))
    }
    private fun finishScrub(commit: Boolean) {
        removeCallbacks(scrubFrame); scrubFrameQueued = false
        if (scrubbing && player != null) { sendScrub(false, commit); player?.endScrub(scrubSession, commit, scrubTarget) }
        scrubbing = false
    }
    private fun beginSideControl(mode: SideSwipeGesture.Mode) {
        if (!available()) return
        sideInteraction = true
        if (mode == SideSwipeGesture.Mode.BRIGHTNESS) initial = brightness.begin(preferredBrightness())
        else if (mode == SideSwipeGesture.Mode.VOLUME) sampleVolume()
        endpointHaptics.begin(normalized(initial)); show(mode, initial)
    }
    private fun normalized(value: Float) = value.coerceIn(0f, 1f)
    private fun preferredBrightness() = try {
        normalized(Settings.System.getInt(activity.contentResolver, Settings.System.SCREEN_BRIGHTNESS, 128) / 255f)
    } catch (_: SecurityException) { .5f }
    private fun sampleVolume() {
        val manager = audio ?: return
        if (manager.isVolumeFixed) return
        minVolume = if (Build.VERSION.SDK_INT >= 28) manager.getStreamMinVolume(AudioManager.STREAM_MUSIC) else 0
        maxVolume = manager.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
        requestedVolume = manager.getStreamVolume(AudioManager.STREAM_MUSIC)
        initial = if (manager.isStreamMute(AudioManager.STREAM_MUSIC)) 0f else
            (requestedVolume - minVolume).toFloat() / maxOf(1, maxVolume - minVolume)
    }
    private fun applyProgress(mode: SideSwipeGesture.Mode, progress: Float) {
        if (!available() || !progress.isFinite()) return
        var value = normalized(progress)
        var displayProgress = value
        if (mode == SideSwipeGesture.Mode.BRIGHTNESS) value = brightness.set(value)
        else if (mode == SideSwipeGesture.Mode.VOLUME) {
            val manager = audio ?: return
            if (manager.isVolumeFixed || maxVolume <= minVolume) return
            val volume = Math.round(minVolume + value * (maxVolume - minVolume))
            try {
                if (volume > minVolume && manager.isStreamMute(AudioManager.STREAM_MUSIC)) manager.adjustStreamVolume(AudioManager.STREAM_MUSIC, AudioManager.ADJUST_UNMUTE, 0)
                if (volume != requestedVolume) { manager.setStreamVolume(AudioManager.STREAM_MUSIC, volume, 0); requestedVolume = volume }
                val actual = manager.getStreamVolume(AudioManager.STREAM_MUSIC)
                value = (actual - minVolume).toFloat() / (maxVolume - minVolume)
                if (actual != volume) displayProgress = value
            } catch (_: SecurityException) { gesture.cancel(); hide(); return }
            catch (_: IllegalArgumentException) { gesture.cancel(); hide(); return }
        } else return
        show(mode, value, displayProgress)
    }
    private fun toggleMute() {
        val manager = audio ?: return
        if (!available() || manager.isVolumeFixed) return
        try {
            manager.adjustStreamVolume(AudioManager.STREAM_MUSIC, if (manager.isStreamMute(AudioManager.STREAM_MUSIC)) AudioManager.ADJUST_UNMUTE else AudioManager.ADJUST_MUTE, 0)
            sampleVolume(); sideInteraction = false; endpointHaptics.end(); show(SideSwipeGesture.Mode.VOLUME, initial)
        } catch (_: SecurityException) { hide() }
        catch (_: IllegalArgumentException) { hide() }
    }
    private fun show(mode: SideSwipeGesture.Mode, value: Float, displayProgress: Float = normalized(value)) {
        removeCallbacks(hideHud); shownMode = mode
        side.update(mode == SideSwipeGesture.Mode.VOLUME, normalized(value), displayProgress,
            audio?.isStreamMute(AudioManager.STREAM_MUSIC) == true, sideInteraction)
        if (endpointHaptics.update(displayProgress)) performHapticFeedback(if (Build.VERSION.SDK_INT >= 34) HapticFeedbackConstants.SEGMENT_TICK else HapticFeedbackConstants.CLOCK_TICK)
        val params = side.layoutParams as LayoutParams
        val height = minOf(dp(232f), maxOf(dp(160f), height - dp(40f) - Math.round(topInset + bottomInset)))
        val gravity = Gravity.CENTER_VERTICAL or if (mode == SideSwipeGesture.Mode.BRIGHTNESS) Gravity.LEFT else Gravity.RIGHT
        val left = maxOf(dp(24f), Math.round(leftEdge)); val right = maxOf(dp(24f), Math.round(rightEdge))
        if (params.height != height || params.gravity != gravity || params.leftMargin != left || params.rightMargin != right) {
            params.height = height; params.gravity = gravity; params.leftMargin = left; params.rightMargin = right; side.layoutParams = params
        }
        side.visibility = View.VISIBLE; side.setHeld(sideInteraction)
    }
    private fun finishSideControl() { sideInteraction = false; endpointHaptics.end(); side.settle(); scheduleHide() }
    private fun scheduleBrightnessResume() {
        if (brightnessResumeQueued) return
        brightnessResumeQueued = true
        // Two traversals keep clearing NONE and restoring the video value distinct.
        postOnAnimation(waitBrightnessFrame)
    }
    private fun scheduleHide() { removeCallbacks(hideHud); postDelayed(hideHud, 900) }
    private fun hide() { endpointHaptics.end(); removeCallbacks(hideHud); side.visibility = View.GONE }
    fun pauseGestures() { finishScrub(false); ownsTouch = false; gesture.cancel(); hide() }
    fun setVideoActive(active: Boolean) {
        if (!active) { pauseGestures(); controlsTop = Float.NaN; controlsVisible = true; brightness.restore() }
    }
    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        val resolver = activity.contentResolver
        resolver.registerContentObserver(Settings.System.getUriFor(Settings.System.SCREEN_BRIGHTNESS), false, systemBrightness)
        resolver.registerContentObserver(Settings.System.getUriFor(Settings.System.SCREEN_BRIGHTNESS_MODE), false, systemBrightness)
    }
    override fun onWindowFocusChanged(hasWindowFocus: Boolean) {
        super.onWindowFocusChanged(hasWindowFocus)
        removeCallbacks(waitBrightnessFrame); removeCallbacks(resumeBrightness); brightnessResumeQueued = false
        if (hasWindowFocus) scheduleBrightnessResume() else { pauseGestures(); brightness.suspend() }
    }
    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) { super.onSizeChanged(w, h, oldw, oldh); pauseGestures(); controlsTop = Float.NaN }
    override fun onDetachedFromWindow() {
        removeCallbacks(waitBrightnessFrame); removeCallbacks(resumeBrightness); brightnessResumeQueued = false
        activity.contentResolver.unregisterContentObserver(systemBrightness)
        setVideoActive(false); super.onDetachedFromWindow()
    }
}
