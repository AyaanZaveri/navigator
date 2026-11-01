package app.navigator.android;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.RectF;
import android.os.Handler;
import android.os.Looper;
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
        if (active) main.post(next);
    }
    private void schedule(long delay) { if (active && !closed) { main.removeCallbacks(next); main.postDelayed(next, delay); } }
    private void capture() {
        if (!active || closed) return;
        if (busy) { schedule(250); return; }
        int vw = viewport.getWidth(), vh = viewport.getHeight(), sw = surface.getWidth(), sh = surface.getHeight();
        if (vw <= 0 || vh <= 0 || sw <= 0 || sh <= 0 || !surface.getHolder().getSurface().isValid()) { schedule(500); return; }
        int[] videoAt = new int[2], viewAt = new int[2];
        surface.getLocationInWindow(videoAt); viewport.getLocationInWindow(viewAt);
        String stamp = position.getAsLong()+":"+vw+":"+vh+":"+sw+":"+sh+":"+videoAt[0]+":"+videoAt[1];
        if (stamp.equals(last)) { schedule(250); return; }
        float scale = Math.min(Math.min(320f/vw, 320f/vh), Math.min(640f/sw, 640f/sh));
        int width = Math.max(1, Math.round(vw*scale)), height = Math.max(1, Math.round(vh*scale));
        RectF destination = new RectF((videoAt[0]-viewAt[0])*scale, (videoAt[1]-viewAt[1])*scale,
            (videoAt[0]-viewAt[0]+sw)*scale, (videoAt[1]-viewAt[1]+sh)*scale);
        Bitmap copy = Bitmap.createBitmap(Math.max(1, Math.round(sw*scale)), Math.max(1, Math.round(sh*scale)), Bitmap.Config.ARGB_8888);
        long owner = generation;
        busy = true;
        try {
            // API 24+: PixelCopy scales the current Surface buffer directly.
            PixelCopy.request(surface, copy, result -> {
                if (closed || !active || owner != generation || result != PixelCopy.SUCCESS) {
                    copy.recycle(); busy = false; schedule(result == PixelCopy.SUCCESS ? 250 : 1000); return;
                }
                encoder.execute(() -> {
                    String src = null;
                    Bitmap canvas = null;
                    try {
                        canvas = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
                        Canvas draw = new Canvas(canvas); draw.drawColor(Color.BLACK);
                        draw.drawBitmap(copy, null, destination, null);
                        ByteArrayOutputStream bytes = new ByteArrayOutputStream(12*1024);
                        if (canvas.compress(Bitmap.CompressFormat.JPEG, 55, bytes))
                            src = "data:image/jpeg;base64,"+Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP);
                    } catch (RuntimeException unavailable) {
                        // Retain the translucent fallback on unsupported buffers.
                    } finally {
                        copy.recycle(); if (canvas != null) canvas.recycle();
                        String frame = src;
                        main.post(() -> {
                            busy = false;
                            if (active && !closed && owner == generation && frame != null) { last = stamp; ready.accept(frame); }
                            schedule(250);
                        });
                    }
                });
            }, main);
        } catch (IllegalArgumentException unavailable) { copy.recycle(); busy = false; schedule(1000); }
    }
    @Override public void close() {
        setActive(false); closed = true; main.removeCallbacks(next); encoder.shutdown();
    }
}
