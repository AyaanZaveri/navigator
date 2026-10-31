package app.navigator.android;

import android.annotation.SuppressLint;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
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
import androidx.activity.OnBackPressedCallback;
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
    private FrameLayout root;
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
    private long pageGeneration;
    private final Runnable tick = new Runnable() {
        @Override public void run() {
            if (player != null && foreground) player.state();
            if (foreground) main.postDelayed(this, 250);
        }
    };

    @SuppressLint("SetJavaScriptEnabled") // Trusted HTTPS origin only; the bridge rejects subframes and other origins.
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        preferences = getSharedPreferences("navigator", MODE_PRIVATE);
        origin = parseOrigin(preferences.getString("server", BuildConfig.NAVIGATOR_URL));
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
        setContentView(root);
        player = new NativePlayer(this, root, this::send);
        if (Build.VERSION.SDK_INT >= 26) getWindow().setColorMode(ActivityInfo.COLOR_MODE_HDR);
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)
                || !WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            showConnection(getString(R.string.webview_update));
            return;
        }
        web = new WebView(this);
        web.setBackgroundColor(Color.TRANSPARENT);
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
                setFullscreen(false);
                pageFailed = false;
                long generation = ++pageGeneration;
                showConnection("Connecting to Navigator…");
                main.postDelayed(() -> {
                    if (!destroyed && generation == pageGeneration && connection != null && connection.getVisibility() == View.VISIBLE) {
                        connectionText.setText("Navigator is taking longer than expected. Check your connection, retry, or choose another server.");
                    }
                }, 20000);
            }
            @Override public void onPageFinished(WebView view, String url) {
                if (trusted(Uri.parse(url)) && !pageFailed) hideConnection();
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
        configureBridge();
        web.loadUrl(origin.toString() + "/");
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                if (connection != null && connection.getVisibility() == View.VISIBLE) { finish(); return; }
                if (fullscreen) { setFullscreen(false); return; }
                if (playerVisible || player.active()) {
                    send(NativePlayer.object("type", "close"));
                    String closing = player.session();
                    main.postDelayed(() -> {
                        if (!destroyed && player.session().equals(closing)) { player.stop(); playerVisible = false; }
                    }, 750);
                } else if (web.canGoBack()) web.goBack(); else finish();
            }
        });
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
                            case "hello": send(NativePlayer.object("type", "fullscreen", "value", fullscreen)); break;
                            case "fullscreen": setFullscreen(request.optBoolean("value")); break;
                            case "visible":
                                playerVisible = request.optBoolean("value");
                                if (!playerVisible) { player.stop(); setFullscreen(false); }
                                break;
                            case "settings": settings(); break;
                            default:
                                if (!foreground) return;
                                player.command(request);
                                if (request.optString("type").equals("load") && player.active()) setFullscreen(true);
                                if (request.optString("type").equals("stop") && !player.active()) setFullscreen(false);
                        }
                    } catch (org.json.JSONException invalid) { /* Reject malformed bridge messages. */ }
                });
        }
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            try (var input = getAssets().open("bridge.js")) {
                java.io.ByteArrayOutputStream bytes = new java.io.ByteArrayOutputStream();
                byte[] buffer = new byte[4096];
                for (int count; (count = input.read(buffer)) != -1;) bytes.write(buffer, 0, count);
                String code = new String(bytes.toByteArray(), StandardCharsets.UTF_8).replace("__ORIGIN__", JSONObject.quote(origin.toString()));
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

    private void setFullscreen(boolean value) {
        fullscreen = value;
        setRequestedOrientation(value ? ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE : ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                if (value) controller.hide(WindowInsets.Type.systemBars()); else controller.show(WindowInsets.Type.systemBars());
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(value
                ? View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                : View.SYSTEM_UI_FLAG_VISIBLE);
        }
        send(NativePlayer.object("type", "fullscreen", "value", value));
    }

    private void failPage(String message) {
        pageFailed = true;
        reply = null;
        if (player != null) player.stop();
        playerVisible = false;
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

    private void settings() {
        if (destroyed) return;
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
        main.post(tick);
    }
    @Override protected void onStop() {
        foreground = false;
        main.removeCallbacksAndMessages(null);
        if (player != null) player.suspend();
        if (web != null) web.onPause();
        CookieManager.getInstance().flush();
        super.onStop();
    }
    @Override protected void onDestroy() {
        destroyed = true;
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
