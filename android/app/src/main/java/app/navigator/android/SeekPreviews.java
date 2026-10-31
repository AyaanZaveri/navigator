package app.navigator.android;

import android.content.Context;
import android.graphics.Bitmap;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.LruCache;
import androidx.media3.common.MediaItem;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.effect.Presentation;
import androidx.media3.exoplayer.SeekParameters;
import androidx.media3.exoplayer.mediacodec.MediaCodecSelector;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.inspector.frame.FrameExtractor;
import com.google.common.util.concurrent.ListenableFuture;
import java.util.List;
import java.util.concurrent.CancellationException;
import java.util.concurrent.ExecutionException;
import java.util.function.Consumer;

/** Application-thread coordinator; decoding and network access are asynchronous.
 * Exactly one extraction is in flight; subsequent moves replace the pending target. */
@UnstableApi
final class SeekPreviews implements AutoCloseable {
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Context context;
    private final MediaItem item;
    private final DefaultMediaSourceFactory source;
    private final LruCache<Long,Bitmap> cache = new LruCache<>(8*1024*1024) {
        @Override protected int sizeOf(Long key,Bitmap value) { return value.getAllocationByteCount(); }
    };
    private FrameExtractor extractor;
    private ListenableFuture<FrameExtractor.Frame> inFlight;
    private Consumer<Bitmap> callback;
    private long wanted = -1, generation, retryAfter;
    private boolean closed, failed;
    private final Runnable idle = this::releaseDecoder;
    private final Runnable timeout = this::fail;

    SeekPreviews(Context context,MediaItem item,DefaultMediaSourceFactory source) {
        this.context=context; this.item=item; this.source=source;
    }
    void request(long position,Consumer<Bitmap> result) {
        if (closed) return;
        wanted=Math.max(0,position/2000*2000); callback=result;
        if (failed && SystemClock.uptimeMillis()>=retryAfter) failed=false;
        main.removeCallbacks(idle);
        Bitmap hit=cache.get(wanted);
        if (hit!=null) deliver(hit);
        else if (failed) deliver(null);
        else if (inFlight==null) extract();
        // Holding still should not keep a second codec alive indefinitely.
        main.postDelayed(idle,10_000);
    }
    private void extract() {
        long key=wanted, owner= generation;
        try {
            if (extractor==null) extractor=new FrameExtractor.Builder(context,item)
                .setMediaSourceFactory(source).setSeekParameters(SeekParameters.CLOSEST_SYNC)
                .setMediaCodecSelector(MediaCodecSelector.DEFAULT)
                .setEffects(List.of(Presentation.createForHeight(180))).build();
            var task=extractor.getFrame(key); inFlight=task;
            main.removeCallbacks(timeout); main.postDelayed(timeout,8000);
            task.addListener(() -> {
                if (closed || generation!=owner || inFlight!=task) return;
                main.removeCallbacks(timeout); inFlight=null;
                try {
                    Bitmap bitmap=task.get().bitmap; cache.put(key,bitmap);
                    if (wanted==key) deliver(bitmap);
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt(); fail();
                } catch (ExecutionException | CancellationException failure) {
                    fail();
                }
                if (!failed && wanted!=key && cache.get(wanted)==null) extract();
            },command -> main.post(command));
        } catch (RuntimeException unsupported) { fail(); }
    }
    private void fail() { failed=true; retryAfter=SystemClock.uptimeMillis()+5000; releaseDecoder(); deliver(null); }
    private void deliver(Bitmap bitmap) { if (callback!=null) callback.accept(bitmap); }
    private void releaseDecoder() {
        generation++; main.removeCallbacks(timeout);
        if (inFlight!=null) { inFlight.cancel(false); inFlight=null; }
        if (extractor!=null) { extractor.close(); extractor=null; }
    }
    @Override public void close() {
        closed=true; callback=null; main.removeCallbacks(idle); releaseDecoder(); cache.evictAll();
    }
}
