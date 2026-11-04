package app.navigator.playbackdemo;

import android.app.Activity;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.media.MediaCodecInfo;
import android.media.MediaCodecList;
import android.media.MediaFormat;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Display;
import android.view.Gravity;
import android.view.SurfaceView;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.TextView;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.Format;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.VideoSize;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.analytics.AnalyticsListener;
import androidx.media3.exoplayer.DecoderCounters;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.util.Collections;

/** Native video stays outside the WebView. Only commands/state cross the bridge. */
@UnstableApi
public final class MainActivity extends Activity {
    private static final String ORIGIN = "https://appassets.androidplatform.net";
    private static final String UI_URL = ORIGIN + "/assets/web/index.html";
    private final Handler main = new Handler(Looper.getMainLooper());
    private FrameLayout root;
    private SurfaceView surface;
    private WebView web;
    private ExoPlayer player;
    private JavaScriptReplyProxy reply;
    private String sample = "sdr";
    private String decoder = "";
    private String error = "";
    private boolean firstFrame;
    private boolean muted;
    private boolean resumePlaying = true;
    private boolean foreground;
    private long resumePosition;
    private double aspect = 16.0 / 9;
    private boolean hdr10;
    private boolean hlg;
    private String displayHdr = "SDR";

    private final Runnable tick = new Runnable() {
        @Override public void run() {
            emit();
            if (foreground) main.postDelayed(this, 250);
        }
    };

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        if (saved != null) {
            sample = saved.getString("sample", "sdr");
            resumePosition = saved.getLong("position");
            resumePlaying = saved.getBoolean("playing", true);
            muted = saved.getBoolean("muted");
        }
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            } else {
                view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            return insets;
        });
        surface = new SurfaceView(this);
        root.addView(surface, new FrameLayout.LayoutParams(-1, -1, Gravity.CENTER));
        root.addOnLayoutChangeListener((v, l, t, r, b, ol, ot, or, ob) -> fitVideo());
        setContentView(root);
        detectHdr();
        if (Build.VERSION.SDK_INT >= 26) getWindow().setColorMode(ActivityInfo.COLOR_MODE_HDR);

        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            TextView message = new TextView(this);
            message.setText("Update Android System WebView to run this demo.");
            message.setTextColor(Color.WHITE);
            message.setGravity(Gravity.CENTER);
            root.addView(message, new FrameLayout.LayoutParams(-1, -1));
            return;
        }
        web = new WebView(this);
        web.setBackgroundColor(Color.TRANSPARENT);
        web.setOverScrollMode(WebView.OVER_SCROLL_NEVER);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setBlockNetworkLoads(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        WebViewAssetLoader assets = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                WebResourceResponse response = assets.shouldInterceptRequest(request.getUrl());
                return response != null ? response : new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !UI_URL.equals(request.getUrl().toString());
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onConsoleMessage(ConsoleMessage message) {
                android.util.Log.d("NavigatorDemoWeb", message.message());
                return true;
            }
        });
        WebViewCompat.addWebMessageListener(web, "NavigatorPlayer", Collections.singleton(ORIGIN),
            (view, message, origin, mainFrame, proxy) -> {
                if (!mainFrame || !ORIGIN.equals(origin.toString()) || message.getData() == null) return;
                reply = proxy;
                handle(message.getData());
            });
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        web.loadUrl(UI_URL);
    }

    private void detectHdr() {
        Display display = getWindowManager().getDefaultDisplay();
        StringBuilder labels = new StringBuilder();
        for (int type : display.getHdrCapabilities().getSupportedHdrTypes()) {
            if (type == Display.HdrCapabilities.HDR_TYPE_HDR10) { hdr10 = true; labels.append("HDR10 "); }
            if (type == Display.HdrCapabilities.HDR_TYPE_HLG) { hlg = true; labels.append("HLG "); }
            if (type == Display.HdrCapabilities.HDR_TYPE_DOLBY_VISION) labels.append("Dolby Vision ");
        }
        displayHdr = labels.length() == 0 ? "SDR" : labels.toString().trim();
        hdr10 &= hasHevcDecoder(MediaCodecInfo.CodecProfileLevel.HEVCProfileMain10HDR10);
        hlg &= hasHevcDecoder(MediaCodecInfo.CodecProfileLevel.HEVCProfileMain10);
    }

    private boolean hasHevcDecoder(int profile) {
        try {
            MediaFormat format = MediaFormat.createVideoFormat("video/hevc", 480, 270);
            format.setInteger(MediaFormat.KEY_PROFILE, profile);
            return new MediaCodecList(MediaCodecList.REGULAR_CODECS).findDecoderForFormat(format) != null;
        } catch (RuntimeException unavailable) { return false; }
    }

    private void startPlayer() {
        if (player != null || web == null) return;
        player = new ExoPlayer.Builder(this).build();
        player.setAudioAttributes(new AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MOVIE).build(), true);
        player.setHandleAudioBecomingNoisy(true);
        player.setVideoSurfaceView(surface);
        player.setRepeatMode(Player.REPEAT_MODE_ONE);
        player.setVolume(muted ? 0 : 1);
        player.addListener(new Player.Listener() {
            @Override public void onEvents(Player ignored, Player.Events events) {
                if (player != null) root.setKeepScreenOn(player.getPlayWhenReady() && error.isEmpty());
                emit();
            }
            @Override public void onRenderedFirstFrame() { firstFrame = true; emit(); }
            @Override public void onVideoSizeChanged(VideoSize size) {
                if (size.height > 0) aspect = (double) size.width * size.pixelWidthHeightRatio / size.height;
                fitVideo();
            }
            @Override public void onPlayerError(PlaybackException failure) {
                error = "Playback failed (" + failure.getErrorCodeName() + "). Select SDR to retry.";
                root.setKeepScreenOn(false);
                emit();
            }
        });
        player.addAnalyticsListener(new AnalyticsListener() {
            @Override public void onVideoDecoderInitialized(EventTime time, String name, long timestamp, long duration) {
                decoder = name;
                emit();
            }
        });
        loadSample(sample, resumePosition, resumePlaying);
    }

    private void loadSample(String next, long position, boolean play) {
        if (player == null) return;
        if (!(next.equals("sdr") || next.equals("pq") || next.equals("hlg"))) return;
        if ((next.equals("pq") && !hdr10) || (next.equals("hlg") && !hlg)) {
            error = "This device does not report the required HDR display and HEVC decoder support. Choose SDR.";
            emit();
            return;
        }
        sample = next;
        error = "";
        decoder = "";
        firstFrame = false;
        player.setMediaItem(MediaItem.fromUri("asset:///media/" + sample + ".mp4"), position);
        player.prepare();
        player.setPlayWhenReady(play);
        emit();
    }

    private void handle(String raw) {
        if (raw.length() > 1024) return;
        try {
            JSONObject message = new JSONObject(raw);
            String type = message.optString("type");
            if (type.equals("ready")) { emit(); return; }
            if (player == null || !foreground) return;
            switch (type) {
                case "toggle": if (player.getPlayWhenReady()) player.pause(); else player.play(); break;
                case "mute": muted = !muted; player.setVolume(muted ? 0 : 1); break;
                case "seek":
                    double at = message.optDouble("position", -1);
                    if (Double.isFinite(at) && at >= 0 && player.getDuration() > 0) player.seekTo((long) Math.min(at, player.getDuration()));
                    break;
                case "load": loadSample(message.optString("sample"), 0, true); break;
                default: return;
            }
            emit();
        } catch (org.json.JSONException invalid) { /* Ignore invalid bridge commands. */ }
    }

    private void fitVideo() {
        int width = root.getWidth() - root.getPaddingLeft() - root.getPaddingRight();
        int height = root.getHeight() - root.getPaddingTop() - root.getPaddingBottom();
        if (width <= 0 || height <= 0) return;
        int w = Math.min(width, (int) Math.round(height * aspect));
        int h = Math.min(height, (int) Math.round(width / aspect));
        ViewGroup.LayoutParams old = surface.getLayoutParams();
        if (old.width != w || old.height != h) surface.setLayoutParams(new FrameLayout.LayoutParams(w, h, Gravity.CENTER));
    }

    private void emit() {
        if (reply == null || web == null || !foreground) return;
        try {
            JSONObject value = new JSONObject();
            value.put("playing", player != null && player.getPlayWhenReady());
            value.put("position", player == null ? resumePosition : Math.max(0, player.getCurrentPosition()));
            value.put("duration", player == null ? 0 : Math.max(0, player.getDuration()));
            value.put("sample", sample);
            value.put("muted", muted);
            value.put("hdr10", hdr10);
            value.put("hlg", hlg);
            value.put("displayHdr", displayHdr);
            value.put("decoder", decoder);
            value.put("frameRendered", firstFrame);
            value.put("error", error);
            DecoderCounters counters = player == null ? null : player.getVideoDecoderCounters();
            if (counters != null) counters.ensureUpdated();
            value.put("renderedFrames", counters == null ? 0 : counters.renderedOutputBufferCount);
            Format format = player == null ? null : player.getVideoFormat();
            int transfer = format != null && format.colorInfo != null ? format.colorInfo.colorTransfer : C.COLOR_TRANSFER_SDR;
            value.put("sourceTransfer", transfer == C.COLOR_TRANSFER_ST2084 ? "PQ / HDR10" : transfer == C.COLOR_TRANSFER_HLG ? "HLG" : "SDR");
            value.put("status", !error.isEmpty() ? "Error" : player == null ? "Stopped" : player.getPlaybackState() == Player.STATE_BUFFERING ? "Loading…" : player.isPlaying() ? "Playing" : "Paused");
            reply.postMessage(value.toString());
        } catch (org.json.JSONException | IllegalStateException ignored) { /* WebView may be closing. */ }
    }

    @Override protected void onStart() {
        super.onStart();
        foreground = true;
        if (web != null) web.onResume();
        startPlayer();
        main.post(tick);
    }

    private void rememberPosition() {
        if (player == null) return;
        resumePosition = Math.max(0, player.getCurrentPosition());
        resumePlaying = player.getPlayWhenReady();
    }

    @Override protected void onSaveInstanceState(Bundle state) {
        rememberPosition();
        state.putString("sample", sample);
        state.putLong("position", resumePosition);
        state.putBoolean("playing", resumePlaying);
        state.putBoolean("muted", muted);
        super.onSaveInstanceState(state);
    }

    @Override protected void onStop() {
        foreground = false;
        main.removeCallbacks(tick);
        rememberPosition();
        if (player != null) { player.release(); player = null; }
        root.setKeepScreenOn(false);
        if (web != null) web.onPause();
        super.onStop();
    }

    @Override protected void onDestroy() {
        reply = null;
        if (web != null) {
            WebViewCompat.removeWebMessageListener(web, "NavigatorPlayer");
            root.removeView(web);
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
