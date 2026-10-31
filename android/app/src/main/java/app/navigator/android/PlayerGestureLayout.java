package app.navigator.android;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.media.AudioManager;
import android.os.Build;
import android.provider.Settings;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.accessibility.AccessibilityManager;
import android.widget.FrameLayout;
import android.widget.TextView;
import java.text.NumberFormat;
import java.util.function.BooleanSupplier;

/** Native side controls. FrameLayout sends ACTION_CANCEL to the WebView only
 * after a vertical swipe is claimed; ordinary taps and controls remain HTML. */
final class PlayerGestureLayout extends FrameLayout {
    private final Activity activity;
    private final AudioManager audio;
    private final AccessibilityManager accessibility;
    private final BooleanSupplier enabled;
    private final SideSwipeGesture gesture;
    private final float density;
    private final TextView hud;
    private final NumberFormat percent = NumberFormat.getPercentInstance();
    private final Runnable hideHud;
    private float topInset, bottomInset, leftEdge, rightEdge;
    private float controlsTop = Float.NaN;
    private float initial;
    private Float savedBrightness;
    private float appliedBrightness = Float.NaN;
    private int minVolume, maxVolume, appliedVolume, requestedVolume;
    private int shownPercent = -1;
    private SideSwipeGesture.Mode shownMode = SideSwipeGesture.Mode.NONE;
    private boolean ownsTouch;

    PlayerGestureLayout(Activity activity, BooleanSupplier enabled) {
        super(activity);
        this.activity = activity; this.enabled = enabled;
        density = getResources().getDisplayMetrics().density;
        audio = activity.getSystemService(AudioManager.class);
        accessibility = activity.getSystemService(AccessibilityManager.class);
        gesture = new SideSwipeGesture(density, ViewConfiguration.get(activity).getScaledTouchSlop());
        hud = new TextView(activity);
        hud.setTextColor(Color.WHITE); hud.setTextSize(16);
        hud.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        hud.setFontFeatureSettings("tnum"); hud.setGravity(Gravity.CENTER);
        hud.setPadding(dp(16), dp(10), dp(16), dp(10));
        hud.setMinWidth(dp(104)); hud.setMinHeight(dp(64));
        hud.setClickable(false); hud.setFocusable(false);
        hud.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        GradientDrawable background = new GradientDrawable();
        background.setColor(Color.argb(210, 12, 12, 12)); background.setCornerRadius(dp(16));
        hud.setBackground(background); hud.setVisibility(View.GONE);
        percent.setMaximumFractionDigits(0);
        hideHud = () -> hud.setVisibility(View.GONE);
    }
    private int dp(float value) { return Math.round(value * density); }
    void installHud() { addView(hud, new FrameLayout.LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT)); }
    void setGestureInsets(float top, float bottom, float left, float right) { topInset = top; bottomInset = bottom; leftEdge = left; rightEdge = right; }
    void setControlsTop(float value) { controlsTop = value; }
    private boolean available() { return enabled.getAsBoolean() && (accessibility == null || !accessibility.isTouchExplorationEnabled()); }

    @Override public boolean onInterceptTouchEvent(MotionEvent event) {
        switch (event.getActionMasked()) {
            case MotionEvent.ACTION_DOWN -> {
                ownsTouch = false; gesture.cancel();
                if (!available() || event.getPointerCount() != 1) return false;
                float bottom = Float.isFinite(controlsTop) ? controlsTop : getHeight() - Math.max(dp(136), bottomInset + dp(112));
                var mode = gesture.begin(event.getX(), event.getY(), getWidth(), getHeight(),
                    Math.max(dp(64), topInset + dp(52)), bottom, leftEdge, rightEdge);
                if (mode == SideSwipeGesture.Mode.VOLUME) {
                    if (audio == null || audio.isVolumeFixed()) { gesture.cancel(); return false; }
                    minVolume = Build.VERSION.SDK_INT >= 28 ? audio.getStreamMinVolume(AudioManager.STREAM_MUSIC) : 0;
                    maxVolume = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
                    appliedVolume = audio.getStreamVolume(AudioManager.STREAM_MUSIC);
                    requestedVolume = appliedVolume;
                    if (maxVolume <= minVolume) { gesture.cancel(); return false; }
                    initial = (float) (appliedVolume - minVolume) / (maxVolume - minVolume);
                } else if (mode == SideSwipeGesture.Mode.BRIGHTNESS) initial = currentBrightness();
            }
            case MotionEvent.ACTION_MOVE -> {
                if (!available() || event.getPointerCount() != 1) { gesture.cancel(); return false; }
                ownsTouch = gesture.move(event.getX(), event.getY()) != SideSwipeGesture.Mode.NONE;
                if (ownsTouch) adjust(event.getY());
                return ownsTouch;
            }
            case MotionEvent.ACTION_POINTER_DOWN, MotionEvent.ACTION_CANCEL, MotionEvent.ACTION_UP -> gesture.cancel();
        }
        return false;
    }
    @Override public void requestDisallowInterceptTouchEvent(boolean disallow) {
        // A WebView may reserve its complete touch sequence. Only eligible,
        // noninteractive side zones can yield to this parent's vertical gesture.
        if (disallow && gesture.candidate() != SideSwipeGesture.Mode.NONE) return;
        super.requestDisallowInterceptTouchEvent(disallow);
    }
    @SuppressLint("ClickableViewAccessibility") // Taps stay in child WebView; this view owns only recognized drags.
    @Override public boolean onTouchEvent(MotionEvent event) {
        if (!ownsTouch) return super.onTouchEvent(event);
        int action = event.getActionMasked();
        if (!available() || event.getPointerCount() != 1 || action == MotionEvent.ACTION_CANCEL) {
            gesture.cancel(); hide();
            if (action == MotionEvent.ACTION_CANCEL || action == MotionEvent.ACTION_UP) ownsTouch = false;
            return true;
        }
        if (action == MotionEvent.ACTION_MOVE || action == MotionEvent.ACTION_UP) adjust(event.getY());
        if (action == MotionEvent.ACTION_UP) {
            ownsTouch = false; gesture.cancel();
            removeCallbacks(hideHud); postDelayed(hideHud, 600);
        }
        return true;
    }
    private float currentBrightness() {
        float value = activity.getWindow().getAttributes().screenBrightness;
        if (value < 0) {
            try { value = Settings.System.getInt(activity.getContentResolver(), Settings.System.SCREEN_BRIGHTNESS, 128) / 255f; }
            catch (SecurityException restricted) { value = .5f; }
        }
        return Math.max(.02f, Math.min(1, value));
    }
    private void adjust(float y) {
        var mode = gesture.mode();
        if (mode == SideSwipeGesture.Mode.NONE) return;
        float value = gesture.value(initial, y, mode == SideSwipeGesture.Mode.BRIGHTNESS ? .02f : 0);
        if (mode == SideSwipeGesture.Mode.BRIGHTNESS) {
            if (!Float.isFinite(appliedBrightness) || Math.abs(value - appliedBrightness) >= .005f) {
                var attributes = activity.getWindow().getAttributes();
                if (savedBrightness == null) savedBrightness = attributes.screenBrightness;
                attributes.screenBrightness = value;
                activity.getWindow().setAttributes(attributes);
                appliedBrightness = value;
            }
        } else {
            int volume = Math.round(minVolume + value * (maxVolume - minVolume));
            if (volume != requestedVolume) {
                requestedVolume = volume;
                try {
                    audio.setStreamVolume(AudioManager.STREAM_MUSIC, volume, 0);
                    appliedVolume = audio.getStreamVolume(AudioManager.STREAM_MUSIC);
                }
                catch (SecurityException | IllegalArgumentException restricted) { gesture.cancel(); hide(); return; }
            }
            value = (float) (appliedVolume - minVolume) / (maxVolume - minVolume);
        }
        show(mode, value);
    }
    private void show(SideSwipeGesture.Mode mode, float value) {
        removeCallbacks(hideHud);
        int number = Math.round(value * 100);
        if (number != shownPercent || mode != shownMode) {
            hud.setText((mode == SideSwipeGesture.Mode.BRIGHTNESS ? "Brightness\n" : "Media volume\n") + percent.format(value));
            shownPercent = number; shownMode = mode;
        }
        var params = (FrameLayout.LayoutParams) hud.getLayoutParams();
        int margin = Math.max(dp(24), Math.round(getWidth() * .13f));
        int gravity = Gravity.CENTER_VERTICAL | (mode == SideSwipeGesture.Mode.BRIGHTNESS ? Gravity.LEFT : Gravity.RIGHT);
        if (params.gravity != gravity || params.leftMargin != margin || params.rightMargin != margin) {
            params.gravity = gravity; params.leftMargin = params.rightMargin = margin;
            hud.setLayoutParams(params);
        }
        hud.setVisibility(View.VISIBLE);
    }
    private void hide() { removeCallbacks(hideHud); hud.setVisibility(View.GONE); }
    void pauseGestures() { ownsTouch = false; gesture.cancel(); hide(); }
    void setVideoActive(boolean active) {
        if (!active) {
            pauseGestures(); controlsTop = Float.NaN;
            if (savedBrightness != null) {
                var attributes = activity.getWindow().getAttributes();
                attributes.screenBrightness = savedBrightness;
                activity.getWindow().setAttributes(attributes);
                savedBrightness = null; appliedBrightness = Float.NaN;
            }
        }
    }
    @Override protected void onSizeChanged(int w, int h, int oldw, int oldh) {
        super.onSizeChanged(w, h, oldw, oldh); pauseGestures(); controlsTop = Float.NaN;
    }
    @Override protected void onDetachedFromWindow() { setVideoActive(false); super.onDetachedFromWindow(); }
}
