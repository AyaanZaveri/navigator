package app.navigator.android

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.RectF
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Base64
import android.view.PixelCopy
import android.view.SurfaceView
import android.view.View
import java.io.ByteArrayOutputStream
import java.util.concurrent.Executors
import java.util.function.Consumer
import java.util.function.LongSupplier

/** Small on-demand samples for glass controls, never a playback/preview decoder. */
class GlassBackdrop(
    private val surface: SurfaceView,
    private val viewport: View,
    private val position: LongSupplier,
    private val ready: Consumer<String>
) : AutoCloseable {
    private val main = Handler(Looper.getMainLooper())
    private val encoder = Executors.newSingleThreadExecutor { Thread(it, "navigator-glass") }
    private val encoded = ByteArrayOutputStream(12 * 1024)
    private val videoAt = IntArray(2)
    private val viewAt = IntArray(2)
    private var copyBuffer: Bitmap? = null
    private var canvasBuffer: Bitmap? = null
    private var active = false
    private var closed = false
    private var busy = false
    private var generation = 0L
    private var last = ""
    private val next = Runnable { capture() }

    fun setActive(value: Boolean) {
        if (closed || value == active) return
        active = value; generation++; last = ""
        main.removeCallbacks(next)
        if (active) main.post(next) else releaseBuffers()
    }
    private fun schedule(delay: Long) {
        if (active && !closed) { main.removeCallbacks(next); main.postDelayed(next, delay) }
    }
    private fun buffer(previous: Bitmap?, width: Int, height: Int): Bitmap {
        if (previous != null && previous.width == width && previous.height == height) return previous
        previous?.recycle()
        return Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    }
    private fun releaseBuffers() {
        if (busy) return // PixelCopy/encoding still owns the buffers.
        copyBuffer?.recycle(); copyBuffer = null
        canvasBuffer?.recycle(); canvasBuffer = null
    }
    private fun complete(owner: Long, stamp: String, frame: String?, started: Long, retryDelay: Long) {
        busy = false
        if (active && !closed && owner == generation && frame != null) { last = stamp; ready.accept(frame) }
        if (!active || closed) releaseBuffers()
        schedule(if (retryDelay > 0) retryDelay else GlassTiming.delayAfter(SystemClock.uptimeMillis() - started))
    }
    private fun capture() {
        if (!active || closed) return
        if (busy) { schedule(GlassTiming.IDLE_MS); return }
        val vw = viewport.width; val vh = viewport.height
        val sw = surface.width; val sh = surface.height
        if (vw <= 0 || vh <= 0 || sw <= 0 || sh <= 0 || !surface.holder.surface.isValid) { schedule(500); return }
        surface.getLocationInWindow(videoAt); viewport.getLocationInWindow(viewAt)
        val stamp = "${position.asLong}:$vw:$vh:$sw:$sh:${videoAt[0]}:${videoAt[1]}"
        // A paused scrub needs no new pixels; CSS follows the finger independently.
        if (stamp == last) { schedule(GlassTiming.IDLE_MS); return }
        val started = SystemClock.uptimeMillis()
        val scale = minOf(256f / vw, 256f / vh, 512f / sw, 512f / sh)
        val width = maxOf(1, Math.round(vw * scale)); val height = maxOf(1, Math.round(vh * scale))
        val destination = RectF((videoAt[0] - viewAt[0]) * scale, (videoAt[1] - viewAt[1]) * scale,
            (videoAt[0] - viewAt[0] + sw) * scale, (videoAt[1] - viewAt[1] + sh) * scale)
        val copy = buffer(copyBuffer, maxOf(1, Math.round(sw * scale)), maxOf(1, Math.round(sh * scale)))
        copyBuffer = copy
        val output = buffer(canvasBuffer, width, height)
        canvasBuffer = output
        val owner = generation
        busy = true
        try {
            // API 24+: PixelCopy scales the current Surface buffer directly.
            PixelCopy.request(surface, copy, { result ->
                if (closed || !active || owner != generation || result != PixelCopy.SUCCESS) {
                    complete(owner, stamp, null, started, if (result == PixelCopy.SUCCESS) GlassTiming.IDLE_MS else 1000)
                } else encoder.execute {
                    var src: String? = null
                    try {
                        Canvas(output).apply { drawColor(Color.BLACK); drawBitmap(copy, null, destination, null) }
                        encoded.reset()
                        if (output.compress(Bitmap.CompressFormat.JPEG, 55, encoded))
                            src = "data:image/jpeg;base64," + Base64.encodeToString(encoded.toByteArray(), Base64.NO_WRAP)
                    } catch (_: RuntimeException) {
                        // Retain the translucent fallback on unsupported buffers.
                    } finally {
                        val frame = src
                        main.post { complete(owner, stamp, frame, started, if (frame == null) 1000 else 0) }
                    }
                }
            }, main)
        } catch (_: IllegalArgumentException) { complete(owner, stamp, null, started, 1000) }
    }
    override fun close() {
        setActive(false); closed = true; main.removeCallbacks(next); encoder.shutdown()
    }
}
