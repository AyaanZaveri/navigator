package app.navigator.android;

import android.content.Context;
import android.graphics.Bitmap;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Base64;
import android.util.LruCache;
import androidx.media3.common.MediaItem;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.effect.Presentation;
import androidx.media3.exoplayer.SeekParameters;
import androidx.media3.exoplayer.mediacodec.MediaCodecSelector;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.inspector.frame.FrameExtractor;
import com.google.common.util.concurrent.ListenableFuture;
import java.io.ByteArrayOutputStream;
import java.util.List;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.function.BiConsumer;

/** Local 256px-high SDR frames for the web UI. One decode and one bounded encoding
 * worker; completed frames stream even while the latest requested time changes. */
@UnstableApi
final class SeekPreviews implements AutoCloseable {
    private final Handler main=new Handler(Looper.getMainLooper());
    private final Context context;
    private final MediaItem item;
    private final DefaultMediaSourceFactory source;
    private final BiConsumer<Long,String> ready;
    private final LruCache<Long,String> cache=new LruCache<>(16*1024*1024) {
        @Override protected int sizeOf(Long key,String value) { return value.length()*2; }
    };
    private final ThreadPoolExecutor encoder=new ThreadPoolExecutor(1,1,10,TimeUnit.SECONDS,
        new ArrayBlockingQueue<>(1),r -> new Thread(r,"navigator-thumbnails"),new ThreadPoolExecutor.AbortPolicy());
    private FrameExtractor extractor;
    private ListenableFuture<FrameExtractor.Frame> inFlight;
    private Long wanted;
    private long warmPosition, warmBuffered, warmDuration;
    private boolean warmEnabled;
    private boolean nextScheduled;
    private final Runnable next=() -> { nextScheduled=false; pump(); };
    private final java.util.Set<Long> encoding=new java.util.HashSet<>();
    private long generation,retryAfter;
    private volatile boolean closed;
    private boolean failed;
    private final Runnable idle=this::releaseDecoder;
    private final Runnable timeout=this::fail;

    SeekPreviews(Context context,MediaItem item,DefaultMediaSourceFactory source,BiConsumer<Long,String> ready) {
        this.context=context; this.item=item; this.source=source; this.ready=ready;
    }
    static long bucket(long position) { return ThumbnailWarmPlan.bucket(position); }
    void request(long position) {
        if (closed) return;
        wanted=bucket(position);
        main.removeCallbacks(next); nextScheduled=false;
        if (failed && SystemClock.uptimeMillis()>=retryAfter) failed=false;
        main.removeCallbacks(idle);
        String hit=cache.get(wanted);
        if (hit!=null) ready.accept(wanted,hit);
        else if (failed) ready.accept(wanted,null);
        else pump();
        main.postDelayed(idle,10_000);
    }
    void cancel() { wanted=null; }
    void warm(long position, long buffered, long duration, boolean enabled) {
        warmPosition=position; warmBuffered=buffered; warmDuration=duration; warmEnabled=enabled;
        if (enabled) pump();
    }
    private void pump() {
        if (closed || inFlight!=null || !encoding.isEmpty() || nextScheduled) return;
        if (failed && SystemClock.uptimeMillis()>=retryAfter) failed=false;
        if (failed) return;
        Long key=wanted!=null && cache.get(wanted)==null ? wanted
            : warmEnabled ? ThumbnailWarmPlan.next(warmPosition,warmBuffered,warmDuration,at -> cache.get(at)!=null) : null;
        if (key!=null) extract(key);
    }
    private void extract(long key) {
        long owner=generation, started=SystemClock.uptimeMillis();
        main.removeCallbacks(idle);
        try {
            if (extractor==null) extractor=new FrameExtractor.Builder(context,item)
                .setMediaSourceFactory(source).setSeekParameters(SeekParameters.EXACT)
                .setMediaCodecSelector(MediaCodecSelector.DEFAULT)
                // Default extractHdrFrames=false tone-maps HDR into SDR BT.709.
                // The panel is 224 CSS pixels wide: 256px high covers a 16:9
                // thumbnail at 2x while reducing bitmap/JPEG/bridge work.
                .setEffects(List.of(Presentation.createForHeight(256))).build();
            var task=extractor.getFrame(key); inFlight=task;
            main.removeCallbacks(timeout); main.postDelayed(timeout,8000);
            task.addListener(() -> {
                if (closed || generation!=owner || inFlight!=task) return;
                main.removeCallbacks(timeout); inFlight=null;
                try {
                    Bitmap bitmap=task.get().bitmap;
                    encoding.add(key);
                    encoder.execute(() -> {
                        if (closed) return;
                        ByteArrayOutputStream bytes=new ByteArrayOutputStream(48*1024);
                        String src=bitmap.compress(Bitmap.CompressFormat.JPEG,74,bytes)
                            ? "data:image/jpeg;base64,"+Base64.encodeToString(bytes.toByteArray(),Base64.NO_WRAP) : null;
                        main.post(() -> {
                            if (closed) return;
                            encoding.remove(key);
                            if (src!=null) cache.put(key,src);
                            if (src!=null || (wanted!=null && wanted==key)) ready.accept(key,src);
                            // Explicit scrub requests jump ahead of background work.
                            long rest=wanted!=null && cache.get(wanted)==null ? 0
                                : ThumbnailWarmPlan.restAfter(SystemClock.uptimeMillis()-started);
                            main.removeCallbacks(next); nextScheduled=true; main.postDelayed(next,rest);
                            main.removeCallbacks(idle); main.postDelayed(idle,10_000);
                        });
                    });
                } catch (Exception failure) { encoding.remove(key); fail(); }
            },command -> main.post(command));
        } catch (RuntimeException unsupported) { fail(); }
    }
    private void fail() {
        failed=true; retryAfter=SystemClock.uptimeMillis()+5000; releaseDecoder();
        if (wanted!=null) ready.accept(wanted,null);
    }
    private void releaseDecoder() {
        generation++; main.removeCallbacks(timeout); main.removeCallbacks(next); nextScheduled=false;
        if (inFlight!=null) { inFlight.cancel(false); inFlight=null; }
        if (extractor!=null) { extractor.close(); extractor=null; }
    }
    @Override public void close() {
        closed=true; wanted=null; main.removeCallbacks(idle); releaseDecoder();
        encoder.getQueue().clear(); encoder.shutdownNow(); encoding.clear(); cache.evictAll();
    }
}
