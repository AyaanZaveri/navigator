package app.navigator.android;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.RectF;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Base64;
import android.view.PixelCopy;
import android.view.SurfaceView;
import android.view.View;
import java.io.ByteArrayOutputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Consumer;
import java.util.function.LongSupplier;

/** Small on-demand samples for glass controls, never a playback/preview decoder. */
final class GlassBackdrop implements AutoCloseable {
    private final SurfaceView surface;
    private final View viewport;
    private final LongSupplier position;
    private final Consumer<String> ready;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService encoder = Executors.newSingleThreadExecutor(r -> new Thread(r, "navigator-glass"));
    private final ByteArrayOutputStream encoded = new ByteArrayOutputStream(12*1024);
    private final int[] videoAt = new int[2], viewAt = new int[2];
    private Bitmap copyBuffer, canvasBuffer;
    private boolean active, closed, busy;
    private long generation;
    private String last = "";
    private final Runnable next = this::capture;

    GlassBackdrop(SurfaceView surface, View viewport, LongSupplier position, Consumer<String> ready) {
        this.surface = surface; this.viewport = viewport; this.position = position; this.ready = ready;
    }
    void setActive(boolean value) {
        if (closed || value == active) return;
        active = value; generation++; last = "";
        main.removeCallbacks(next);
        if (active) main.post(next); else releaseBuffers();
    }
    private void schedule(long delay) {
        if (active && !closed) { main.removeCallbacks(next); main.postDelayed(next, delay); }
    }
    private static Bitmap buffer(Bitmap previous, int width, int height) {
        if (previous != null && previous.getWidth() == width && previous.getHeight() == height) return previous;
        if (previous != null) previous.recycle();
        return Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
    }
    private void releaseBuffers() {
        if (busy) return; // PixelCopy/encoding still owns the buffers.
        if (copyBuffer != null) { copyBuffer.recycle(); copyBuffer = null; }
        if (canvasBuffer != null) { canvasBuffer.recycle(); canvasBuffer = null; }
    }
    private void complete(long owner, String stamp, String frame, long started, long retryDelay) {
        busy = false;
        if (active && !closed && owner == generation && frame != null) { last = stamp; ready.accept(frame); }
        if (!active || closed) releaseBuffers();
        schedule(retryDelay > 0 ? retryDelay : GlassTiming.delayAfter(SystemClock.uptimeMillis()-started));
    }
    private void capture() {
        if (!active || closed) return;
        if (busy) { schedule(GlassTiming.IDLE_MS); return; }
        int vw = viewport.getWidth(), vh = viewport.getHeight(), sw = surface.getWidth(), sh = surface.getHeight();
        if (vw <= 0 || vh <= 0 || sw <= 0 || sh <= 0 || !surface.getHolder().getSurface().isValid()) { schedule(500); return; }
        surface.getLocationInWindow(videoAt); viewport.getLocationInWindow(viewAt);
        String stamp = position.getAsLong()+":"+vw+":"+vh+":"+sw+":"+sh+":"+videoAt[0]+":"+videoAt[1];
        // A paused scrub needs no new pixels; CSS follows the finger independently.
        if (stamp.equals(last)) { schedule(GlassTiming.IDLE_MS); return; }
        long started = SystemClock.uptimeMillis();
        float scale = Math.min(Math.min(256f/vw, 256f/vh), Math.min(512f/sw, 512f/sh));
        int width = Math.max(1, Math.round(vw*scale)), height = Math.max(1, Math.round(vh*scale));
        RectF destination = new RectF((videoAt[0]-viewAt[0])*scale, (videoAt[1]-viewAt[1])*scale,
            (videoAt[0]-viewAt[0]+sw)*scale, (videoAt[1]-viewAt[1]+sh)*scale);
        copyBuffer = buffer(copyBuffer, Math.max(1, Math.round(sw*scale)), Math.max(1, Math.round(sh*scale)));
        canvasBuffer = buffer(canvasBuffer, width, height);
        Bitmap copy = copyBuffer, output = canvasBuffer;
        long owner = generation;
        busy = true;
        try {
            // API 24+: PixelCopy scales the current Surface buffer directly.
            PixelCopy.request(surface, copy, result -> {
                if (closed || !active || owner != generation || result != PixelCopy.SUCCESS) {
                    complete(owner, stamp, null, started, result == PixelCopy.SUCCESS ? GlassTiming.IDLE_MS : 1000); return;
                }
                encoder.execute(() -> {
                    String src = null;
                    try {
                        Canvas draw = new Canvas(output); draw.drawColor(Color.BLACK);
                        draw.drawBitmap(copy, null, destination, null);
                        encoded.reset();
                        if (output.compress(Bitmap.CompressFormat.JPEG, 55, encoded))
                            src = "data:image/jpeg;base64,"+Base64.encodeToString(encoded.toByteArray(), Base64.NO_WRAP);
                    } catch (RuntimeException unavailable) {
                        // Retain the translucent fallback on unsupported buffers.
                    } finally {
                        String frame = src;
                        main.post(() -> complete(owner, stamp, frame, started, frame == null ? 1000 : 0));
                    }
                });
            }, main);
        } catch (IllegalArgumentException unavailable) { complete(owner, stamp, null, started, 1000); }
    }
    @Override public void close() {
        setActive(false); closed = true; main.removeCallbacks(next); encoder.shutdown();
    }
}
