package app.navigator.android

import android.annotation.SuppressLint
import android.animation.ValueAnimator
import android.app.AlertDialog
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.ActivityInfo
import android.graphics.Bitmap
import android.graphics.Color
import android.media.AudioManager
import android.net.Uri
import android.net.http.SslError
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.RoundedCorner
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.animation.PathInterpolator
import android.webkit.ConsoleMessage
import android.webkit.CookieManager
import android.webkit.SslErrorHandler
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.BackEventCompat
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.activity.SystemBarStyle
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.media3.common.util.UnstableApi
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.ScriptHandler
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import app.navigator.android.NativePlayer.Companion.json
import org.json.JSONException
import org.json.JSONObject
import java.net.URI
import java.util.Locale
import kotlin.math.abs
import kotlin.math.sqrt

@UnstableApi
class MainActivity : ComponentActivity() {
    private val main = Handler(Looper.getMainLooper())
    private lateinit var root: PlayerGestureLayout
    private var web: WebView? = null
    private var player: NativePlayer? = null
    private var reply: JavaScriptReplyProxy? = null
    private var script: ScriptHandler? = null
    private var connection: LinearLayout? = null
    private var connectionText: TextView? = null
    private lateinit var preferences: SharedPreferences
    private lateinit var origin: URI
    private var foreground = false
    private var fullscreen = false
    private var playerVisible = false
    private var destroyed = false
    private var pageFailed = false
    private var launching = true
    private var launchBackdrop: LaunchBackdrop? = null
    private var pageLoading = false
    private var webDark = true
    private var scrolling = false
    private var webOverlayOpen = false
    private var backCallback: OnBackPressedCallback? = null
    private var backGesture = false
    private var previewBack = false
    private var backStartScale = 1f
    private var backStartX = 0f
    private var backDirection = 0f
    private var highRefreshRequested = false
    private var webBackground = Int.MIN_VALUE
    private var windowColorMode = -1
    private var playerInsets: WindowInsetsCompat? = null
    private var controlsTop = Double.NaN
    private var controlsBottom = Double.NaN
    private var controlsViewportWidth = 0.0
    private var controlsViewportHeight = 0.0
    private var safeInsets = json("type", "insets", "top", 0, "right", 0, "bottom", 0, "left", 0)
    private var pageGeneration = 0L
    private val tick = object : Runnable {
        override fun run() {
            if (foreground) { player?.state(); player?.warmPreviews(); main.postDelayed(this, 250) }
        }
    }

    @SuppressLint("SetJavaScriptEnabled") // Trusted HTTPS origin; bridge rejects subframes and other origins.
    override fun onCreate(savedInstanceState: Bundle?) {
        val splash = installSplashScreen()
        super.onCreate(savedInstanceState)
        // The native branded surface covers startup until WebView has real pixels.
        splash.setKeepOnScreenCondition { launching && !destroyed && (!::root.isInitialized || root.width == 0) }
        splash.setOnExitAnimationListener { provider ->
            val finish = Runnable {
                provider.remove()
                if (!destroyed) { configureEdgeToEdge(); ViewCompat.requestApplyInsets(root) }
            }
            if (LaunchBackdrop.animationsEnabled(this)) provider.view.animate().alpha(0f).setDuration(120).withEndAction(finish).start()
            else finish.run()
        }
        configureEdgeToEdge()
        preferences = getSharedPreferences("navigator", MODE_PRIVATE)
        origin = parseOrigin(preferences.getString("server", BuildConfig.NAVIGATOR_URL))
        root = PlayerGestureLayout(this, { foreground && playerVisible && player?.readyForGestures() == true && !webOverlayOpen }, ::send)
        root.setBackgroundColor(Color.BLACK)
        ViewCompat.setOnApplyWindowInsetsListener(root) { _, insets ->
            playerInsets = insets
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            val density = resources.displayMetrics.density
            val gestures = insets.getInsets(WindowInsetsCompat.Type.systemGestures())
            root.setGestureInsets(bars.top.toFloat(), bars.bottom.toFloat(), gestures.left.toFloat(), gestures.right.toFloat())
            safeInsets = json("type", "insets", "top", bars.top / density,
                "right", bars.right / density, "bottom", bars.bottom / density, "left", bars.left / density,
                "cornerBottomLeft", bottomCornerRadius(insets, true, density),
                "cornerBottomRight", bottomCornerRadius(insets, false, density), "playerBackLeft", playerBackLeft(insets, bars.top, density))
            send(safeInsets); sendPlayerLayoutInsets()
            // Do not consume/pad the window: the document spaces content once.
            insets
        }
        root.addOnLayoutChangeListener { _, l, t, r, b, ol, ot, oldRight, ob ->
            if (r - l != oldRight - ol || b - t != ob - ot) ViewCompat.requestApplyInsets(root)
        }
        setContentView(root)
        player = NativePlayer(this, root, ::send)
        root.setPlayer(requireNotNull(player))
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER) ||
            !WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            launching = false; showConnection(getString(R.string.webview_update)); return
        }
        val browser = WebView(this)
        web = browser
        updateWebPresentation()
        browser.overScrollMode = View.OVER_SCROLL_NEVER
        browser.settings.apply {
            javaScriptEnabled = true; domStorageEnabled = true
            allowFileAccess = false; allowContentAccess = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            setSupportMultipleWindows(false)
        }
        CookieManager.getInstance().apply { setAcceptCookie(true); setAcceptThirdPartyCookies(browser, false) }
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        browser.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (trusted(request.url)) return false
                val scheme = request.url.scheme
                if (request.isForMainFrame && (scheme == "https" || scheme == "http")) {
                    try { startActivity(Intent(Intent.ACTION_VIEW, request.url)) } catch (_: RuntimeException) { }
                }
                return true
            }
            override fun onPageStarted(view: WebView, url: String, icon: Bitmap?) {
                reply = null; player?.stop(); playerVisible = false
                controlsTop = Double.NaN; controlsBottom = Double.NaN
                scrolling = false; webOverlayOpen = false
                updateWebPresentation(); setFullscreen(false)
                pageFailed = false; pageLoading = true
                val generation = ++pageGeneration
                hideConnection()
                main.postDelayed({
                    if (!destroyed && generation == pageGeneration && pageLoading && !pageFailed)
                        failPage("Navigator did not load. Check your connection, retry, or choose another server.")
                }, 30_000)
            }
            override fun onPageCommitVisible(view: WebView, url: String) { if (trusted(Uri.parse(url)) && !pageFailed) revealPage() }
            override fun doUpdateVisitedHistory(view: WebView, url: String, reload: Boolean) {
                // Includes pushState/popstate in the Next.js app.
                view.post { updateBackCallback() }
            }
            override fun onPageFinished(view: WebView, url: String) {
                updateBackCallback()
                if (trusted(Uri.parse(url)) && !pageFailed) {
                    val generation = pageGeneration
                    view.postVisualStateCallback(generation, object : WebView.VisualStateCallback() {
                        override fun onComplete(requestId: Long) {
                            if (!destroyed && requestId == pageGeneration && !pageFailed) revealPage()
                        }
                    })
                }
                CookieManager.getInstance().flush()
            }
            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame) failPage("Could not connect to Navigator. Check your connection and server address.")
            }
            override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, response: WebResourceResponse) {
                if (request.isForMainFrame && response.statusCode >= 400) failPage("Navigator returned an error (HTTP ${response.statusCode}). Retry or check the server address.")
            }
            override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: SslError) {
                handler.cancel(); failPage("Could not establish a secure connection to Navigator.")
            }
        }
        browser.webChromeClient = object : WebChromeClient() {
            // Remote pages may log credentials; never copy their console into device logs.
            override fun onConsoleMessage(message: ConsoleMessage) = true
        }
        root.addView(browser, FrameLayout.LayoutParams(-1, -1))
        root.installHud(); volumeControlStream = AudioManager.STREAM_MUSIC
        configureBridge(); configureBackNavigation()
        launchBackdrop = LaunchBackdrop(this).also { root.addView(it, FrameLayout.LayoutParams(-1, -1)) }
        browser.loadUrl("$origin/")
        if (intent.action == "app.navigator.android.SETTINGS") main.post { settings() }
    }
    private fun parseOrigin(url: String?): URI {
        val parsed = try { StreamPolicy.webOrigin(url?.trim()) }
            catch (_: IllegalArgumentException) { StreamPolicy.webOrigin(BuildConfig.NAVIGATOR_URL) }
        val port = parsed.port
        return URI.create("https://" + parsed.host.lowercase(Locale.ROOT) + if (port > 0 && port != 443) ":$port" else "")
    }
    private fun trusted(uri: Uri) = try { StreamPolicy.sameOrigin(origin, StreamPolicy.streamUrl(uri.toString())) }
        catch (_: IllegalArgumentException) { false }

    private fun configureBridge() {
        val browser = web ?: return
        script?.remove()
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.removeWebMessageListener(browser, "NavigatorAndroid")
            WebViewCompat.addWebMessageListener(browser, "NavigatorAndroid", setOf(origin.toString())) { _, message, source, mainFrame, proxy ->
                val data = message.data
                if (!mainFrame || !trusted(source) || data == null || data.length > 65536) return@addWebMessageListener
                reply = proxy
                try {
                    val request = JSONObject(data)
                    when (request.optString("type")) {
                        "hello" -> { send(json("type", "fullscreen", "value", fullscreen)); send(safeInsets) }
                        "appearance" -> { webDark = request.optBoolean("dark", true); updateSystemBarAppearance(); updateWebPresentation() }
                        "player-controls" -> root.setControlsVisible(request.optBoolean("visible", true))
                        "player-layout" -> {
                            val top = request.optDouble("top", Double.NaN); val bottom = request.optDouble("bottom", Double.NaN)
                            val width = request.optDouble("viewportWidth", Double.NaN); val height = request.optDouble("viewportHeight", Double.NaN)
                            val density = resources.displayMetrics.density
                            if (top.isFinite() && bottom.isFinite() && width.isFinite() && height.isFinite() &&
                                top >= 0 && bottom > top && bottom <= height + 2 && width > 0 && height > 0 &&
                                abs(width - browser.width / density) < 3 && abs(height - browser.height / density) < 3) {
                                controlsTop = top; controlsBottom = bottom; controlsViewportWidth = width; controlsViewportHeight = height
                                sendPlayerLayoutInsets()
                            }
                        }
                        "navigation" -> { webOverlayOpen = request.optBoolean("overlayOpen", false); browser.post { updateBackCallback() } }
                        "scrolling" -> { scrolling = foreground && request.optBoolean("value", false); updateWebPresentation() }
                        "fullscreen" -> setFullscreen(request.optBoolean("value"))
                        "visible" -> {
                            playerVisible = request.optBoolean("value")
                            updateSystemBarAppearance()
                            if (!playerVisible) player?.stop()
                            setFullscreen(playerVisible)
                            updateWebPresentation()
                        }
                        "seek-feedback" -> {
                            val current = player
                            if (foreground && playerVisible && !webOverlayOpen && current?.canScrub() == true && current.session() == request.optString("session"))
                                root.performHapticFeedback(if (Build.VERSION.SDK_INT >= 34) HapticFeedbackConstants.SEGMENT_TICK else HapticFeedbackConstants.CLOCK_TICK)
                        }
                        "settings" -> settings()
                        else -> {
                            if (!foreground) return@addWebMessageListener
                            player?.command(request); updateWebPresentation()
                            if (request.optString("type") == "load" && player?.active() == true) setFullscreen(true)
                            if (request.optString("type") == "stop" && player?.active() != true && !playerVisible) setFullscreen(false)
                        }
                    }
                } catch (_: JSONException) { /* Reject malformed bridge messages. */ }
            }
        }
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            try {
                val code = readAsset("bridge.js")
                    .replace("__ORIGIN__", JSONObject.quote(origin.toString()))
                    .replace("__EDGE_CSS__", JSONObject.quote(readAsset("edge-to-edge.css")))
                    .replace("__TOUCH_CONTROLS__", readAsset("touch-controls.js"))
                    .replace("__BACK_NAVIGATION__", readAsset("back-navigation.js"))
                    .replace("__PLAYER_UI__", readAsset("player-ui.js"))
                    .replace("__WEB_SCRUB__", readAsset("web-scrub.js"))
                script = WebViewCompat.addDocumentStartJavaScript(browser, code, setOf(origin.toString()))
            } catch (_: java.io.IOException) { failPage("The Android playback bridge is missing. Reinstall Navigator.") }
        }
    }
    private fun send(message: JSONObject) {
        val proxy = reply ?: return
        if (destroyed || !foreground) return
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            try { proxy.postMessage(message.toString()) } catch (_: IllegalStateException) { reply = null }
        }
    }
    private fun readAsset(name: String) = assets.open(name).bufferedReader(Charsets.UTF_8).use { it.readText() }

    private fun sendPlayerLayoutInsets() {
        var left = 24.0; var right = 24.0
        root.setControlsTop(Float.NaN)
        val browser = web; val insets = playerInsets
        if (browser != null && insets != null && controlsTop.isFinite()) {
            val density = resources.displayMetrics.density
            val width = browser.width / density; val height = browser.height / density
            if (abs(width - controlsViewportWidth) < 3 && abs(height - controlsViewportHeight) < 3) {
                root.setControlsTop(controlsTop.toFloat() * density)
                insets.displayCutout?.boundingRects?.forEach { rect ->
                    if (rect.top / density < controlsBottom && rect.bottom / density > controlsTop) {
                        if (rect.left / density < 24) left = maxOf(left, (rect.right / density + 12).toDouble())
                        if (rect.right / density > width - 24) right = maxOf(right, (width - rect.left / density + 12).toDouble())
                    }
                }
            }
        }
        send(json("type", "player-layout", "left", left, "right", right))
    }
    private fun bottomCornerRadius(insets: WindowInsetsCompat, left: Boolean, density: Float): Float {
        if (Build.VERSION.SDK_INT >= 31) {
            val corner = insets.toWindowInsets()?.getRoundedCorner(if (left) RoundedCorner.POSITION_BOTTOM_LEFT else RoundedCorner.POSITION_BOTTOM_RIGHT)
            if (corner != null) return corner.radius / density
        }
        return 48f // Conservative phone-shaped fallback when no radius is reported.
    }
    private fun playerBackLeft(insets: WindowInsetsCompat, top: Int, density: Float): Float {
        var result = 16 * density
        val y = top + 16 * density
        insets.displayCutout?.boundingRects?.forEach { rect ->
            // A landscape camera at mid-height does not obstruct the top button.
            if (rect.top < y + 44 * density && rect.bottom > y && rect.left <= result) result = maxOf(result, rect.right + 8 * density)
        }
        if (Build.VERSION.SDK_INT >= 31) {
            val corner = insets.toWindowInsets()?.getRoundedCorner(RoundedCorner.POSITION_TOP_LEFT)
            if (corner != null && y < corner.center.y) {
                val radius = corner.radius.toFloat(); val delta = minOf(radius, corner.center.y - y)
                result = maxOf(result, corner.center.x - sqrt(radius * radius - delta * delta))
            }
        }
        return result / density
    }
    private fun backAction() = BackPolicy.action(connection?.visibility == View.VISIBLE, webOverlayOpen,
        playerVisible || player?.active() == true, web?.canGoBack() == true)
    private fun updateBackCallback() { if (!backGesture) backCallback?.isEnabled = backAction() != BackPolicy.Action.SYSTEM }
    private fun animationsEnabled() = Build.VERSION.SDK_INT < 26 || ValueAnimator.areAnimatorsEnabled()
    private fun resetBackPreview(animate: Boolean) {
        backGesture = false; previewBack = false
        web?.let { browser ->
            browser.animate().cancel()
            if (animate && animationsEnabled()) browser.animate().scaleX(1f).scaleY(1f).translationX(0f)
                .setDuration(180).setInterpolator(PathInterpolator(.23f, 1f, .32f, 1f)).start()
            else { browser.scaleX = 1f; browser.scaleY = 1f; browser.translationX = 0f }
        }
        updateBackCallback()
    }
    private fun configureBackNavigation() {
        val callback = object : OnBackPressedCallback(false) {
            override fun handleOnBackStarted(backEvent: BackEventCompat) {
                backGesture = true
                previewBack = backAction() == BackPolicy.Action.GO_BACK && animationsEnabled()
                if (!previewBack) return
                val browser = web ?: return
                browser.animate().cancel(); backStartScale = browser.scaleX; backStartX = browser.translationX
                backDirection = if (backEvent.swipeEdge == BackEventCompat.EDGE_LEFT) 1f else -1f
            }
            override fun handleOnBackProgressed(backEvent: BackEventCompat) {
                if (!previewBack) return
                val browser = web ?: return
                val progress = backEvent.progress.coerceIn(0f, 1f)
                val scale = backStartScale + (.92f - backStartScale) * progress
                browser.scaleX = scale; browser.scaleY = scale
                browser.translationX = backStartX + (backDirection * browser.width * .04f - backStartX) * progress
            }
            override fun handleOnBackCancelled() = resetBackPreview(true)
            override fun handleOnBackPressed() {
                val action = backAction(); val settle = previewBack
                when (action) {
                    BackPolicy.Action.DISMISS_OVERLAY -> send(json("type", "dismiss-overlay"))
                    BackPolicy.Action.CLOSE_PLAYER -> {
                        // One Back closes playback, including immersive fullscreen.
                        send(json("type", "close")); player?.stop(); playerVisible = false
                        setFullscreen(false); updateWebPresentation()
                    }
                    BackPolicy.Action.GO_BACK -> web?.goBack()
                    BackPolicy.Action.SYSTEM, BackPolicy.Action.LEAVE_ERROR -> finish()
                }
                resetBackPreview(settle)
            }
        }
        backCallback = callback
        onBackPressedDispatcher.addCallback(this, callback); updateBackCallback()
    }
    private fun updateWebPresentation() {
        updateBackCallback()
        val browser = web ?: return
        val playback = playerVisible || player?.active() == true
        root.setVideoActive(playback)
        // UI stays SDR; HDR belongs to the independent SurfaceView.
        val background = if (playback) Color.TRANSPARENT else if (webDark) Color.rgb(10, 10, 10) else Color.WHITE
        if (background != webBackground) {
            webBackground = background; browser.setBackgroundColor(background)
            root.setBackgroundColor(if (playback) Color.BLACK else background)
        }
        if (Build.VERSION.SDK_INT >= 26 && windowColorMode != ActivityInfo.COLOR_MODE_DEFAULT) {
            windowColorMode = ActivityInfo.COLOR_MODE_DEFAULT; window.colorMode = ActivityInfo.COLOR_MODE_DEFAULT
        }
        // CSS overflow flings are invisible to native ScrollView velocity hints.
        val high = foreground && scrolling && !playback
        if (Build.VERSION.SDK_INT >= 35 && high != highRefreshRequested) {
            highRefreshRequested = high
            browser.setRequestedFrameRate(if (high) View.REQUESTED_FRAME_RATE_CATEGORY_HIGH else View.REQUESTED_FRAME_RATE_CATEGORY_DEFAULT)
        }
    }
    @Suppress("DEPRECATION") // Pre-35 system-bar compatibility.
    private fun configureEdgeToEdge() {
        enableEdgeToEdge(SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT), SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT))
        WindowCompat.setDecorFitsSystemWindows(window, false)
        if (Build.VERSION.SDK_INT < 35) window.navigationBarColor = Color.TRANSPARENT
        if (Build.VERSION.SDK_INT >= 28 && Build.VERSION.SDK_INT < 35) window.navigationBarDividerColor = Color.TRANSPARENT
        if (Build.VERSION.SDK_INT >= 29) { window.isStatusBarContrastEnforced = false; window.isNavigationBarContrastEnforced = false }
        updateSystemBarAppearance()
    }
    private fun updateSystemBarAppearance() {
        val controller = WindowCompat.getInsetsController(window, window.decorView)
        val lightBackground = !webDark && !playerVisible
        controller.isAppearanceLightStatusBars = lightBackground; controller.isAppearanceLightNavigationBars = lightBackground
    }
    @Suppress("DEPRECATION") // Pre-30 immersive-mode compatibility.
    private fun setFullscreen(value: Boolean) {
        fullscreen = value; configureEdgeToEdge()
        requestedOrientation = if (value) ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE else ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
        if (Build.VERSION.SDK_INT >= 30) {
            window.insetsController?.let { controller ->
                controller.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                if (value) controller.hide(WindowInsets.Type.systemBars()) else controller.show(WindowInsets.Type.systemBars())
            }
        } else {
            val layout = View.SYSTEM_UI_FLAG_LAYOUT_STABLE or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            window.decorView.systemUiVisibility = layout or if (value) View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY else 0
        }
        send(json("type", "fullscreen", "value", value)); ViewCompat.requestApplyInsets(root); updateSystemBarAppearance()
    }
    private fun failPage(message: String) {
        launching = false; pageLoading = false; pageFailed = true; reply = null
        player?.stop(); playerVisible = false; scrolling = false
        updateWebPresentation(); setFullscreen(false); showConnection(message)
    }
    private fun showConnection(message: String) {
        launchBackdrop?.dismiss(false)
        val panel = connection ?: LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER
            setPadding(32, 32, 32, 32); setBackgroundColor(Color.rgb(8, 13, 11))
            connectionText = TextView(this@MainActivity).also {
                it.setTextColor(Color.WHITE); it.textSize = 17f; it.gravity = Gravity.CENTER; addView(it)
            }
            addView(Button(this@MainActivity).apply { text = "Retry"; setOnClickListener { web?.loadUrl("$origin/") } })
            addView(Button(this@MainActivity).apply { setText(R.string.app_settings); setOnClickListener { settings() } })
            root.addView(this, FrameLayout.LayoutParams(-1, -1)); connection = this
        }
        connectionText?.text = message; panel.visibility = View.VISIBLE; panel.bringToFront()
    }
    private fun hideConnection() { connection?.visibility = View.GONE }
    private fun revealPage() { launching = false; launchBackdrop?.dismiss(true); pageLoading = false; hideConnection() }
    private fun settings() {
        if (destroyed) return
        launchBackdrop?.dismiss(false); launching = false
        val address = EditText(this).apply {
            inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_URI
            setSingleLine(true); setText(origin.toString())
        }
        val padding = (20 * resources.displayMetrics.density).toInt()
        val content = LinearLayout(this).apply { setPadding(padding, padding / 2, padding, 0); addView(address, LinearLayout.LayoutParams(-1, -2)) }
        val dialog = AlertDialog.Builder(this).setTitle("Navigator server")
            .setMessage("The HTTPS Navigator website to open in this app.").setView(content)
            .setNegativeButton("Cancel", null).setPositiveButton("Save", null)
            .setNeutralButton("Use default") { _, _ -> changeServer(BuildConfig.NAVIGATOR_URL) }.create()
        dialog.setOnShowListener {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                val value = address.text.toString().trim()
                try { StreamPolicy.webOrigin(value) }
                catch (invalid: IllegalArgumentException) { address.error = invalid.message; return@setOnClickListener }
                changeServer(value); dialog.dismiss()
            }
        }
        dialog.show()
    }
    private fun changeServer(url: String) {
        origin = parseOrigin(url); preferences.edit().putString("server", origin.toString()).apply()
        player?.stop(); playerVisible = false; setFullscreen(false); reply = null
        web?.let { it.stopLoading(); configureBridge(); it.loadUrl("$origin/"); it.clearHistory() }
    }
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent); setIntent(intent)
        if (intent.action == "app.navigator.android.SETTINGS") settings()
    }
    override fun onStart() {
        super.onStart(); foreground = true; web?.onResume(); player?.start(); updateWebPresentation(); main.post(tick)
    }
    override fun onStop() {
        foreground = false; root.pauseGestures(); resetBackPreview(false); scrolling = false; updateWebPresentation()
        main.removeCallbacks(tick); player?.suspend(); web?.onPause(); CookieManager.getInstance().flush(); super.onStop()
    }
    override fun onDestroy() {
        destroyed = true; launchBackdrop?.close(); root.setVideoActive(false); main.removeCallbacksAndMessages(null)
        reply = null; player?.destroy(); script?.remove()
        web?.let { browser ->
            if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) WebViewCompat.removeWebMessageListener(browser, "NavigatorAndroid")
            root.removeView(browser); browser.destroy()
        }
        super.onDestroy()
    }
}
