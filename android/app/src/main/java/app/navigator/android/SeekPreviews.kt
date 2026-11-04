package app.navigator.android

import android.content.Context
import android.graphics.Bitmap
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Base64
import android.util.LruCache
import androidx.media3.common.MediaItem
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.Presentation
import androidx.media3.exoplayer.SeekParameters
import androidx.media3.exoplayer.mediacodec.MediaCodecSelector
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.inspector.frame.FrameExtractor
import com.google.common.util.concurrent.ListenableFuture
import java.io.ByteArrayOutputStream
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit

/** Local 256px-high SDR frames. One decode and one bounded encoding worker;
 * completed frames stream even while the latest requested time changes. */
@UnstableApi
class SeekPreviews(private val context: Context, private val item: MediaItem,
                   private val source: DefaultMediaSourceFactory, private val ready: (Long, String?) -> Unit) : AutoCloseable {
    private val main = Handler(Looper.getMainLooper())
    private val cache = object : LruCache<Long, String>(16 * 1024 * 1024) {
        override fun sizeOf(key: Long, value: String) = value.length * 2
    }
    private val encoder = ThreadPoolExecutor(1, 1, 10, TimeUnit.SECONDS, ArrayBlockingQueue(1),
        { Thread(it, "navigator-thumbnails") }, ThreadPoolExecutor.AbortPolicy())
    private var extractor: FrameExtractor? = null
    private var inFlight: ListenableFuture<FrameExtractor.Frame>? = null
    private var wanted: Long? = null
    private var warmPosition = 0L
    private var warmBuffered = 0L
    private var warmDuration = 0L
    private var warmEnabled = false
    private var nextScheduled = false
    private val next = Runnable { nextScheduled = false; pump() }
    private val encoding = mutableSetOf<Long>()
    private var generation = 0L
    private var retryAfter = 0L
    @Volatile private var closed = false
    private var failed = false
    private val idle = Runnable { releaseDecoder() }
    private val timeout = Runnable { fail() }

    fun request(position: Long) {
        if (closed) return
        val key = bucket(position)
        wanted = key
        main.removeCallbacks(next); nextScheduled = false
        if (failed && SystemClock.uptimeMillis() >= retryAfter) failed = false
        main.removeCallbacks(idle)
        val hit = cache.get(key)
        if (hit != null) ready(key, hit) else if (failed) ready(key, null) else pump()
        main.postDelayed(idle, 10_000)
    }
    fun cancel() { wanted = null }
    fun warm(position: Long, buffered: Long, duration: Long, enabled: Boolean) {
        warmPosition = position; warmBuffered = buffered; warmDuration = duration; warmEnabled = enabled
        if (enabled) pump()
    }
    private fun pump() {
        if (closed || inFlight != null || encoding.isNotEmpty() || nextScheduled) return
        if (failed && SystemClock.uptimeMillis() >= retryAfter) failed = false
        if (failed) return
        val requested = wanted
        val key = if (requested != null && cache.get(requested) == null) requested
            else if (warmEnabled) ThumbnailWarmPlan.next(warmPosition, warmBuffered, warmDuration) { cache.get(it) != null } else null
        if (key != null) extract(key)
    }
    private fun extract(key: Long) {
        val owner = generation; val started = SystemClock.uptimeMillis()
        main.removeCallbacks(idle)
        try {
            val decoder = extractor ?: FrameExtractor.Builder(context, item)
                .setMediaSourceFactory(source).setSeekParameters(SeekParameters.EXACT)
                .setMediaCodecSelector(MediaCodecSelector.DEFAULT)
                // Default extractHdrFrames=false tone-maps HDR to SDR BT.709.
                // 256px high covers the 224 CSS-pixel panel at 2x.
                .setEffects(listOf(Presentation.createForHeight(256))).build().also { extractor = it }
            val task = decoder.getFrame(key)
            inFlight = task
            main.removeCallbacks(timeout); main.postDelayed(timeout, 8000)
            task.addListener({
                if (!closed && generation == owner && inFlight === task) {
                    main.removeCallbacks(timeout); inFlight = null
                    try {
                        val bitmap = task.get().bitmap
                        encoding.add(key)
                        encoder.execute {
                            if (!closed) {
                                val bytes = ByteArrayOutputStream(48 * 1024)
                                val src = if (bitmap.compress(Bitmap.CompressFormat.JPEG, 74, bytes))
                                    "data:image/jpeg;base64," + Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP) else null
                                main.post {
                                    if (!closed) {
                                        encoding.remove(key)
                                        if (src != null) cache.put(key, src)
                                        if (src != null || wanted == key) ready(key, src)
                                        // Explicit scrub requests jump ahead of background work.
                                        val requested = wanted
                                        val rest = if (requested != null && cache.get(requested) == null) 0L
                                            else ThumbnailWarmPlan.restAfter(SystemClock.uptimeMillis() - started)
                                        main.removeCallbacks(next); nextScheduled = true; main.postDelayed(next, rest)
                                        main.removeCallbacks(idle); main.postDelayed(idle, 10_000)
                                    }
                                }
                            }
                        }
                    } catch (_: Exception) { encoding.remove(key); fail() }
                }
            }, { main.post(it) })
        } catch (_: RuntimeException) { fail() }
    }
    private fun fail() {
        failed = true; retryAfter = SystemClock.uptimeMillis() + 5000; releaseDecoder()
        wanted?.let { ready(it, null) }
    }
    private fun releaseDecoder() {
        generation++; main.removeCallbacks(timeout); main.removeCallbacks(next); nextScheduled = false
        inFlight?.cancel(false); inFlight = null
        extractor?.close(); extractor = null
    }
    override fun close() {
        closed = true; wanted = null; main.removeCallbacks(idle); releaseDecoder()
        encoder.queue.clear(); encoder.shutdownNow(); encoding.clear(); cache.evictAll()
    }
    companion object { @JvmStatic fun bucket(position: Long) = ThumbnailWarmPlan.bucket(position) }
}
