package app.navigator.android;

import android.annotation.SuppressLint;
import android.animation.ValueAnimator;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.RoundedCorner;
import android.view.animation.PathInterpolator;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.ConsoleMessage;
import android.webkit.CookieManager;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.activity.ComponentActivity;
import androidx.activity.BackEventCompat;
import androidx.activity.EdgeToEdge;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.SystemBarStyle;
import androidx.core.graphics.Insets;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.media3.common.util.UnstableApi;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.ScriptHandler;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import org.json.JSONObject;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Collections;

@UnstableApi
public final class MainActivity extends ComponentActivity {
    private final Handler main = new Handler(Looper.getMainLooper());
    private PlayerGestureLayout root;
    private WebView web;
    private NativePlayer player;
    private JavaScriptReplyProxy reply;
    private ScriptHandler script;
    private LinearLayout connection;
    private TextView connectionText;
    private SharedPreferences preferences;
    private URI origin;
    private boolean foreground;
    private boolean fullscreen;
    private boolean playerVisible;
    private boolean destroyed;
    private boolean pageFailed;
    private boolean launching = true;
    private boolean pageLoading;
    private boolean webDark = true;
    private boolean scrolling;
    private boolean webOverlayOpen;
    private OnBackPressedCallback backCallback;
    private boolean backGesture;
    private boolean previewBack;
    private float backStartScale = 1;
    private float backStartX;
    private float backDirection;
    private boolean highRefreshRequested;
    private int webBackground = Integer.MIN_VALUE;
    private int windowColorMode = -1;
    private WindowInsetsCompat playerInsets;
    private double controlsTop = Double.NaN;
    private double controlsBottom = Double.NaN;
    private double controlsViewportWidth;
    private double controlsViewportHeight;
    private JSONObject safeInsets = NativePlayer.object("type", "insets", "top", 0, "right", 0, "bottom", 0, "left", 0);
    private long pageGeneration;
    private final Runnable tick = new Runnable() {
        @Override public void run() {
            if (player != null && foreground) { player.state(); player.warmPreviews(); }
            if (foreground) main.postDelayed(this, 250);
        }
    };

    @SuppressLint("SetJavaScriptEnabled") // Trusted HTTPS origin only; the bridge rejects subframes and other origins.
    @Override public void onCreate(Bundle state) {
        SplashScreen splash = SplashScreen.installSplashScreen(this);
        super.onCreate(state);
        splash.setKeepOnScreenCondition(() -> launching && !destroyed);
        splash.setOnExitAnimationListener(provider -> {
            provider.remove();
            // Splash theme restoration must not reintroduce opaque system bars.
            enableEdgeToEdge();
            ViewCompat.requestApplyInsets(root);
        });
        enableEdgeToEdge();
        preferences = getSharedPreferences("navigator", MODE_PRIVATE);
        origin = parseOrigin(preferences.getString("server", BuildConfig.NAVIGATOR_URL));
        root = new PlayerGestureLayout(this, () -> foreground && playerVisible && player != null && player.readyForGestures() && !webOverlayOpen, this::send);
        root.setBackgroundColor(Color.BLACK);
        ViewCompat.setOnApplyWindowInsetsListener(root, (view, insets) -> {
            playerInsets = insets;
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            float density = getResources().getDisplayMetrics().density;
            Insets gestures = insets.getInsets(WindowInsetsCompat.Type.systemGestures());
            root.setGestureInsets(bars.top, bars.bottom, gestures.left, gestures.right);
            safeInsets = NativePlayer.object("type", "insets", "top", bars.top / density,
                "right", bars.right / density, "bottom", bars.bottom / density, "left", bars.left / density,
                "cornerBottomLeft", bottomCornerRadius(insets, true, density),
                "cornerBottomRight", bottomCornerRadius(insets, false, density),
                "playerBackLeft", playerBackLeft(insets, bars.top, density));
            send(safeInsets);
            sendPlayerLayoutInsets();
            // Do not pad or consume the window: WebView owns the full background,
            // and its document applies safe spacing once to interactive content.
            return insets;
        });
        root.addOnLayoutChangeListener((view, l, t, r, b, ol, ot, or, ob) -> {
            if (r - l != or - ol || b - t != ob - ot) ViewCompat.requestApplyInsets(root);
        });
        setContentView(root);
        player = new NativePlayer(this, root, this::send);
        root.setPlayer(player);
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)
                || !WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            launching = false;
            showConnection(getString(R.string.webview_update));
            return;
        }
        web = new WebView(this);
        updateWebPresentation();
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(false);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (trusted(request.getUrl())) return false;
                String scheme = request.getUrl().getScheme();
                if (request.isForMainFrame() && ("https".equals(scheme) || "http".equals(scheme))) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, request.getUrl())); } catch (RuntimeException ignored) { }
                }
                return true;
            }
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
                reply = null;
                player.stop();
                playerVisible = false;
                controlsTop = controlsBottom = Double.NaN;
                scrolling = false;
                webOverlayOpen = false;
                updateWebPresentation();
                setFullscreen(false);
                pageFailed = false;
                pageLoading = true;
                long generation = ++pageGeneration;
                hideConnection();
                main.postDelayed(() -> {
                    if (!destroyed && generation == pageGeneration && pageLoading && !pageFailed) {
                        failPage("Navigator did not load. Check your connection, retry, or choose another server.");
                    }
                }, 30000);
            }
            @Override public void onPageCommitVisible(WebView view, String url) {
                if (trusted(Uri.parse(url)) && !pageFailed) revealPage();
            }
            @Override public void doUpdateVisitedHistory(WebView view, String url, boolean reload) {
                // Includes pushState/popstate navigations in the Next.js app.
                view.post(() -> updateBackCallback());
            }
            @Override public void onPageFinished(WebView view, String url) {
                updateBackCallback();
                if (trusted(Uri.parse(url)) && !pageFailed) {
                    long generation = pageGeneration;
                    view.postVisualStateCallback(generation, new WebView.VisualStateCallback() {
                        @Override public void onComplete(long requestId) {
                            if (!destroyed && requestId == pageGeneration && !pageFailed) revealPage();
                        }
                    });
                }
                CookieManager.getInstance().flush();
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) failPage("Could not connect to Navigator. Check your connection and server address.");
            }
            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, android.webkit.WebResourceResponse response) {
                if (request.isForMainFrame() && response.getStatusCode() >= 400) failPage("Navigator returned an error (HTTP " + response.getStatusCode() + "). Retry or check the server address.");
            }
            @Override public void onReceivedSslError(WebView view, SslErrorHandler handler, android.net.http.SslError error) {
                handler.cancel();
                failPage("Could not establish a secure connection to Navigator.");
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onConsoleMessage(ConsoleMessage message) {
                // Remote pages can log stream credentials; do not copy their console into device logs.
                return true;
            }
        });
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        root.installHud();
        setVolumeControlStream(AudioManager.STREAM_MUSIC);
        configureBridge();
        configureBackNavigation();
        web.loadUrl(origin.toString() + "/");
        if ("app.navigator.android.SETTINGS".equals(getIntent().getAction())) main.post(this::settings);
    }

    private URI parseOrigin(String url) {
        URI parsed;
        try { parsed = StreamPolicy.webOrigin(url.trim()); }
        catch (IllegalArgumentException invalid) { parsed = StreamPolicy.webOrigin(BuildConfig.NAVIGATOR_URL); }
        int port = parsed.getPort();
        return URI.create("https://" + parsed.getHost().toLowerCase(java.util.Locale.ROOT) + (port > 0 && port != 443 ? ":" + port : ""));
    }

    private boolean trusted(Uri uri) {
        try { return StreamPolicy.sameOrigin(origin, StreamPolicy.streamUrl(uri.toString())); }
        catch (IllegalArgumentException invalid) { return false; }
    }

    private void configureBridge() {
        if (script != null) script.remove();
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.removeWebMessageListener(web, "NavigatorAndroid");
            WebViewCompat.addWebMessageListener(web, "NavigatorAndroid", Collections.singleton(origin.toString()),
                (view, message, source, mainFrame, proxy) -> {
                    if (!mainFrame || !trusted(source) || message.getData() == null || message.getData().length() > 65536) return;
                    reply = proxy;
                    try {
                        JSONObject request = new JSONObject(message.getData());
                        switch (request.optString("type")) {
                            case "hello":
                                send(NativePlayer.object("type", "fullscreen", "value", fullscreen));
                                send(safeInsets);
                                break;
                            case "appearance":
                                webDark = request.optBoolean("dark", true);
                                updateSystemBarAppearance(); updateWebPresentation(); break;
                            case "player-controls":
                                root.setControlsVisible(request.optBoolean("visible",true)); break;
                            case "player-layout":
                                double top = request.optDouble("top", Double.NaN);
                                double bottom = request.optDouble("bottom", Double.NaN);
                                double width = request.optDouble("viewportWidth", Double.NaN);
                                double height = request.optDouble("viewportHeight", Double.NaN);
                                float density = getResources().getDisplayMetrics().density;
                                if (Double.isFinite(top) && Double.isFinite(bottom) && Double.isFinite(width) && Double.isFinite(height)
                                        && top >= 0 && bottom > top && bottom <= height + 2 && width > 0 && height > 0
                                        && Math.abs(width - web.getWidth() / density) < 3 && Math.abs(height - web.getHeight() / density) < 3) {
                                    controlsTop = top; controlsBottom = bottom;
                                    controlsViewportWidth = width; controlsViewportHeight = height;
                                    sendPlayerLayoutInsets();
                                }
                                break;
                            case "navigation":
                                webOverlayOpen = request.optBoolean("overlayOpen", false);
                                web.post(() -> updateBackCallback()); break;
                            case "scrolling":
                                scrolling = foreground && request.optBoolean("value", false);
                                updateWebPresentation(); break;
                            case "fullscreen": setFullscreen(request.optBoolean("value")); break;
                            case "visible":
                                playerVisible = request.optBoolean("value");
                                updateSystemBarAppearance();
                                if (!playerVisible) player.stop();
                                setFullscreen(playerVisible);
                                updateWebPresentation();
                                break;
                            case "seek-feedback":
                                if (foreground && playerVisible && !webOverlayOpen && player.canScrub()
                                        && player.session().equals(request.optString("session")))
                                    root.performHapticFeedback(Build.VERSION.SDK_INT>=34
                                        ? android.view.HapticFeedbackConstants.SEGMENT_TICK : android.view.HapticFeedbackConstants.CLOCK_TICK);
                                break;
                            case "settings": settings(); break;
                            default:
                                if (!foreground) return;
                                player.command(request);
                                updateWebPresentation();
                                if (request.optString("type").equals("load") && player.active()) setFullscreen(true);
                                if (request.optString("type").equals("stop") && !player.active() && !playerVisible) setFullscreen(false);
                        }
                    } catch (org.json.JSONException invalid) { /* Reject malformed bridge messages. */ }
                });
        }
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            try (var input = getAssets().open("bridge.js")) {
                java.io.ByteArrayOutputStream bytes = new java.io.ByteArrayOutputStream();
                byte[] buffer = new byte[4096];
                for (int count; (count = input.read(buffer)) != -1;) bytes.write(buffer, 0, count);
                String code = new String(bytes.toByteArray(), StandardCharsets.UTF_8)
                    .replace("__ORIGIN__", JSONObject.quote(origin.toString()))
                    .replace("__EDGE_CSS__", JSONObject.quote(readAsset("edge-to-edge.css")))
                    .replace("__TOUCH_CONTROLS__", readAsset("touch-controls.js"))
                    .replace("__BACK_NAVIGATION__", readAsset("back-navigation.js"))
                    .replace("__PLAYER_UI__", readAsset("player-ui.js"))
                    .replace("__WEB_SCRUB__", readAsset("web-scrub.js"));
                script = WebViewCompat.addDocumentStartJavaScript(web, code, Collections.singleton(origin.toString()));
            } catch (java.io.IOException failure) { failPage("The Android playback bridge is missing. Reinstall Navigator."); }
        }
    }

    private void send(JSONObject message) {
        if (reply == null || destroyed || !foreground) return;
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            try { reply.postMessage(message.toString()); } catch (IllegalStateException detached) { reply = null; }
        }
    }

    private String readAsset(String name) throws java.io.IOException {
        try (var input = getAssets().open(name)) {
            java.io.ByteArrayOutputStream bytes = new java.io.ByteArrayOutputStream();
            byte[] buffer = new byte[4096];
            for (int count; (count = input.read(buffer)) != -1;) bytes.write(buffer, 0, count);
            return new String(bytes.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    private void sendPlayerLayoutInsets() {
        double left = 24, right = 24;
        root.setControlsTop(Float.NaN);
        if (web != null && playerInsets != null && Double.isFinite(controlsTop)) {
            float density = getResources().getDisplayMetrics().density;
            double width = web.getWidth() / density, height = web.getHeight() / density;
            if (Math.abs(width - controlsViewportWidth) < 3 && Math.abs(height - controlsViewportHeight) < 3) {
                root.setControlsTop((float) controlsTop * density);
                var cutout = playerInsets.getDisplayCutout();
                if (cutout != null) for (var rect : cutout.getBoundingRects()) {
                    if (rect.top / density < controlsBottom && rect.bottom / density > controlsTop) {
                        if (rect.left / density < 24) left = Math.max(left, rect.right / density + 12);
                        if (rect.right / density > width - 24) right = Math.max(right, width - rect.left / density + 12);
                    }
                }
            }
        }
        send(NativePlayer.object("type", "player-layout", "left", left, "right", right));
    }

    private float bottomCornerRadius(WindowInsetsCompat insets, boolean left, float density) {
        if (Build.VERSION.SDK_INT >= 31 && insets.toWindowInsets() != null) {
            var corner = insets.toWindowInsets().getRoundedCorner(left
                ? RoundedCorner.POSITION_BOTTOM_LEFT : RoundedCorner.POSITION_BOTTOM_RIGHT);
            if (corner != null) return corner.getRadius() / density;
        }
        return 48; // A conservative phone-shaped fallback when no radius is reported.
    }

    private float playerBackLeft(WindowInsetsCompat insets, int top, float density) {
        float result = 16 * density;
        float y = top + 16 * density;
        var cutout = insets.getDisplayCutout();
        if (cutout != null) for (var rect : cutout.getBoundingRects()) {
            // A landscape camera at mid-height does not obstruct the top button.
            if (rect.top < y + 44 * density && rect.bottom > y && rect.left <= result) {
                result = Math.max(result, rect.right + 8 * density);
            }
        }
        if (Build.VERSION.SDK_INT >= 31 && insets.toWindowInsets() != null) {
            var corner = insets.toWindowInsets().getRoundedCorner(RoundedCorner.POSITION_TOP_LEFT);
            if (corner != null && y < corner.getCenter().y) {
                float radius = corner.getRadius();
                float delta = Math.min(radius, corner.getCenter().y - y);
                result = Math.max(result, corner.getCenter().x - (float) Math.sqrt(radius * radius - delta * delta));
            }
        }
        return result / density;
    }

    private BackPolicy.Action backAction() {
        return BackPolicy.action(connection != null && connection.getVisibility() == View.VISIBLE,
            webOverlayOpen, playerVisible || (player != null && player.active()), web != null && web.canGoBack());
    }

    private void updateBackCallback() {
        if (backCallback != null && !backGesture) backCallback.setEnabled(backAction() != BackPolicy.Action.SYSTEM);
    }

    private boolean animationsEnabled() {
        return Build.VERSION.SDK_INT < 26 || ValueAnimator.areAnimatorsEnabled();
    }

    private void resetBackPreview(boolean animate) {
        backGesture = false;
        previewBack = false;
        if (web != null) {
            web.animate().cancel();
            if (animate && animationsEnabled()) web.animate().scaleX(1).scaleY(1).translationX(0)
                .setDuration(180).setInterpolator(new PathInterpolator(.23f, 1, .32f, 1)).start();
            else { web.setScaleX(1); web.setScaleY(1); web.setTranslationX(0); }
        }
        updateBackCallback();
    }

    private void configureBackNavigation() {
        backCallback = new OnBackPressedCallback(false) {
            @Override public void handleOnBackStarted(BackEventCompat event) {
                backGesture = true;
                previewBack = backAction() == BackPolicy.Action.GO_BACK && animationsEnabled();
                if (!previewBack) return;
                web.animate().cancel();
                backStartScale = web.getScaleX();
                backStartX = web.getTranslationX();
                backDirection = event.getSwipeEdge() == BackEventCompat.EDGE_LEFT ? 1 : -1;
            }
            @Override public void handleOnBackProgressed(BackEventCompat event) {
                if (!previewBack) return;
                float progress = Math.max(0, Math.min(1, event.getProgress()));
                float scale = backStartScale + (.92f - backStartScale) * progress;
                web.setScaleX(scale); web.setScaleY(scale);
                web.setTranslationX(backStartX + (backDirection * web.getWidth() * .04f - backStartX) * progress);
            }
            @Override public void handleOnBackCancelled() { resetBackPreview(true); }
            @Override public void handleOnBackPressed() {
                BackPolicy.Action action = backAction();
                boolean settle = previewBack;
                switch (action) {
                    case DISMISS_OVERLAY -> send(NativePlayer.object("type", "dismiss-overlay"));
                    case CLOSE_PLAYER -> {
                        // A single Back closes playback, including immersive fullscreen.
                        send(NativePlayer.object("type", "close"));
                        player.stop(); playerVisible = false;
                        setFullscreen(false); updateWebPresentation();
                    }
                    case GO_BACK -> web.goBack();
                    case SYSTEM, LEAVE_ERROR -> finish();
                }
                resetBackPreview(settle);
            }
        };
        getOnBackPressedDispatcher().addCallback(this, backCallback);
        updateBackCallback();
    }

    private void updateWebPresentation() {
        updateBackCallback();
        if (web == null) return;
        boolean playback = playerVisible || (player != null && player.active());
        root.setVideoActive(playback);
        // Keep the controls' window SDR. HDR video belongs to ExoPlayer's
        // independent SurfaceView; the window color mode configures the UI buffer.
        // Only playback needs a transparent WebView above that surface.
        int background = playback ? Color.TRANSPARENT : (webDark ? Color.rgb(10, 10, 10) : Color.WHITE);
        if (background != webBackground) {
            webBackground = background;
            web.setBackgroundColor(background);
            root.setBackgroundColor(playback ? Color.BLACK : background);
        }
        if (Build.VERSION.SDK_INT >= 26 && windowColorMode != ActivityInfo.COLOR_MODE_DEFAULT) {
            windowColorMode = ActivityInfo.COLOR_MODE_DEFAULT;
            getWindow().setColorMode(ActivityInfo.COLOR_MODE_DEFAULT);
        }
        // Android 15+ defaults many custom Views to the normal frame-rate
        // category. CSS overflow flings are invisible to native ScrollView's
        // velocity reporting, so explicitly vote HIGH only while browsing scrolls.
        boolean high = foreground && scrolling && !playback;
        if (Build.VERSION.SDK_INT >= 35 && high != highRefreshRequested) {
            highRefreshRequested = high;
            web.setRequestedFrameRate(high
                ? View.REQUESTED_FRAME_RATE_CATEGORY_HIGH
                : View.REQUESTED_FRAME_RATE_CATEGORY_DEFAULT);
        }
    }

    private void enableEdgeToEdge() {
        EdgeToEdge.enable(this,
            SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT),
            SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT));
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        if (Build.VERSION.SDK_INT < 35) getWindow().setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= 28 && Build.VERSION.SDK_INT < 35) getWindow().setNavigationBarDividerColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= 29) {
            getWindow().setStatusBarContrastEnforced(false);
            getWindow().setNavigationBarContrastEnforced(false);
        }
        updateSystemBarAppearance();
    }

    private void updateSystemBarAppearance() {
        var controller = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        boolean lightBackground = !webDark && !playerVisible;
        controller.setAppearanceLightStatusBars(lightBackground);
        controller.setAppearanceLightNavigationBars(lightBackground);
    }

    private void setFullscreen(boolean value) {
        fullscreen = value;
        enableEdgeToEdge();
        setRequestedOrientation(value ? ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE : ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                if (value) controller.hide(WindowInsets.Type.systemBars()); else controller.show(WindowInsets.Type.systemBars());
            }
        } else {
            int layout = View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION;
            getWindow().getDecorView().setSystemUiVisibility(layout | (value
                ? View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                : 0));
        }
        send(NativePlayer.object("type", "fullscreen", "value", value));
        ViewCompat.requestApplyInsets(root);
        updateSystemBarAppearance();
    }

    private void failPage(String message) {
        launching = false;
        pageLoading = false;
        pageFailed = true;
        reply = null;
        if (player != null) player.stop();
        playerVisible = false;
        scrolling = false;
        updateWebPresentation();
        setFullscreen(false);
        showConnection(message);
    }

    private void showConnection(String message) {
        if (connection == null) {
            connection = new LinearLayout(this);
            connection.setOrientation(LinearLayout.VERTICAL);
            connection.setGravity(Gravity.CENTER);
            connection.setPadding(32, 32, 32, 32);
            connection.setBackgroundColor(Color.rgb(8, 13, 11));
            connectionText = new TextView(this);
            connectionText.setTextColor(Color.WHITE);
            connectionText.setTextSize(17);
            connectionText.setGravity(Gravity.CENTER);
            connection.addView(connectionText);
            Button retry = new Button(this);
            retry.setText("Retry");
            retry.setOnClickListener(v -> { if (web != null) web.loadUrl(origin.toString() + "/"); });
            connection.addView(retry);
            Button settings = new Button(this);
            settings.setText(R.string.app_settings);
            settings.setOnClickListener(v -> settings());
            connection.addView(settings);
            root.addView(connection, new FrameLayout.LayoutParams(-1, -1));
        }
        connectionText.setText(message);
        connection.setVisibility(View.VISIBLE);
        connection.bringToFront();
    }
    private void hideConnection() { if (connection != null) connection.setVisibility(View.GONE); }
    private void revealPage() {
        launching = false;
        pageLoading = false;
        hideConnection();
    }

    private void settings() {
        if (destroyed) return;
        launching = false;
        EditText address = new EditText(this);
        address.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_URI);
        address.setSingleLine(true);
        address.setText(origin.toString());
        int padding = (int) (20 * getResources().getDisplayMetrics().density);
        LinearLayout content = new LinearLayout(this);
        content.setPadding(padding, padding / 2, padding, 0);
        content.addView(address, new LinearLayout.LayoutParams(-1, -2));
        AlertDialog dialog = new AlertDialog.Builder(this).setTitle("Navigator server")
            .setMessage("The HTTPS Navigator website to open in this app.")
            .setView(content).setNegativeButton("Cancel", null).setPositiveButton("Save", null)
            .setNeutralButton("Use default", (d, which) -> changeServer(BuildConfig.NAVIGATOR_URL)).create();
        dialog.setOnShowListener(ignored -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            String value = address.getText().toString().trim();
            try { StreamPolicy.webOrigin(value); }
            catch (IllegalArgumentException invalid) { address.setError(invalid.getMessage()); return; }
            changeServer(value);
            dialog.dismiss();
        }));
        dialog.show();
    }
    private void changeServer(String url) {
        origin = parseOrigin(url);
        preferences.edit().putString("server", origin.toString()).apply();
        player.stop();
        playerVisible = false;
        setFullscreen(false);
        reply = null;
        if (web != null) {
            web.stopLoading();
            configureBridge();
            web.loadUrl(origin.toString() + "/");
            web.clearHistory();
        }
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if ("app.navigator.android.SETTINGS".equals(intent.getAction())) settings();
    }
    @Override protected void onStart() {
        super.onStart();
        foreground = true;
        if (web != null) web.onResume();
        if (player != null) player.start();
        updateWebPresentation();
        main.post(tick);
    }
    @Override protected void onStop() {
        foreground = false;
        root.pauseGestures();
        resetBackPreview(false);
        scrolling = false;
        updateWebPresentation();
        main.removeCallbacks(tick);
        if (player != null) player.suspend();
        if (web != null) web.onPause();
        CookieManager.getInstance().flush();
        super.onStop();
    }
    @Override protected void onDestroy() {
        destroyed = true;
        root.setVideoActive(false);
        main.removeCallbacksAndMessages(null);
        reply = null;
        if (player != null) player.destroy();
        if (script != null) script.remove();
        if (web != null) {
            if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) WebViewCompat.removeWebMessageListener(web, "NavigatorAndroid");
            root.removeView(web);
            web.destroy();
        }
        super.onDestroy();
    }
}
