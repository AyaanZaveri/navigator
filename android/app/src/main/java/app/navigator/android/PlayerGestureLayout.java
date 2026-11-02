package app.navigator.android;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.database.ContentObserver;
import android.os.Handler;
import android.os.Looper;
import android.media.AudioManager;
import android.os.Build;
import android.provider.Settings;
import android.view.Gravity;
import android.view.HapticFeedbackConstants;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.WindowManager;
import android.view.accessibility.AccessibilityManager;
import android.widget.FrameLayout;
import androidx.media3.common.util.UnstableApi;

import java.util.function.BooleanSupplier;
import java.util.function.Consumer;
import org.json.JSONObject;

/** Native gestures claim only directional drags, cancelling the WebView's tap. */
@UnstableApi
final class PlayerGestureLayout extends FrameLayout {
    private final Activity activity;
    private final AudioManager audio;
    private final AccessibilityManager accessibility;
    private final BooleanSupplier enabled;
    private final SideSwipeGesture gesture;
    private final ScrubGesture scrub = new ScrubGesture();
    private final float density;
    private final SideControlView side;
    private final Consumer<JSONObject> emit;
    private final Runnable scrubFrame;
    private boolean scrubFrameQueued;
    private float scrubX;
    private final Runnable hideHud, resumeBrightness, waitBrightnessFrame;
    private NativePlayer player;
    private float topInset, bottomInset, leftEdge, rightEdge, downX;
    private float controlsTop = Float.NaN, initial;
    private final PlaybackBrightness brightness;
    private final EndpointHaptics endpointHaptics=new EndpointHaptics();
    private final ContentObserver systemBrightness;
    private boolean sideInteraction, brightnessResumeQueued;
    private int minVolume, maxVolume, requestedVolume;
    private SideSwipeGesture.Mode shownMode = SideSwipeGesture.Mode.NONE;
    private boolean ownsTouch, controlsVisible = true, scrubbing;
    private String scrubSession;
    private long scrubTarget;

    PlayerGestureLayout(Activity activity, BooleanSupplier enabled, Consumer<JSONObject> emit) {
        super(activity); this.activity = activity; this.enabled = enabled; this.emit=emit;
        scrubFrame=() -> { scrubFrameQueued=false; if (scrubbing) sendScrub(true); };
        density = getResources().getDisplayMetrics().density;
        brightness=new PlaybackBrightness(new PlaybackBrightness.Window() {
            @Override public float read() { return activity.getWindow().getAttributes().screenBrightness; }
            @Override public void write(float value) {
                var attrs=activity.getWindow().getAttributes();
                // FULL is an absolute display request, independent of the system slider.
                attrs.screenBrightness=value==1 ? WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_FULL
                    : value==0 ? WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_OFF : value;
                activity.getWindow().setAttributes(attrs);
            }
        });
        resumeBrightness=() -> {
            brightnessResumeQueued=false;
            if (hasWindowFocus()) brightness.reapply();
        };
        waitBrightnessFrame=() -> postOnAnimation(resumeBrightness);
        systemBrightness=new ContentObserver(new Handler(Looper.getMainLooper())) {
            @Override public void onChange(boolean selfChange) {
                brightness.systemChanged();
                if (hasWindowFocus()) scheduleBrightnessResume();
            }
        };
        audio = activity.getSystemService(AudioManager.class);
        accessibility = activity.getSystemService(AccessibilityManager.class);
        gesture = new SideSwipeGesture(density, ViewConfiguration.get(activity).getScaledTouchSlop());
        hideHud = () -> sideView().setVisibility(View.GONE);
        side = new SideControlView(activity,value -> applyProgress(shownMode,value),this::toggleMute,
            () -> { removeCallbacks(hideHud); beginSideControl(shownMode); },this::finishSideControl);
    }
    private SideControlView sideView() { return side; }
    private int dp(float value) { return Math.round(value*density); }
    void setPlayer(NativePlayer value) { player = value; }
    void installHud() {
        addView(side,new LayoutParams(dp(56),dp(232)));
    }
    void setGestureInsets(float top,float bottom,float left,float right) { topInset=top; bottomInset=bottom; leftEdge=left; rightEdge=right; }
    void setControlsTop(float value) { controlsTop=value; }
    void setControlsVisible(boolean value) {
        boolean revealed=value && !controlsVisible;
        controlsVisible=value;
        if (revealed && scrubbing) pauseGestures();
        if (!value && !scrubbing && player != null && available()) player.warmPreview();
    }
    private boolean available() { return hasWindowFocus() && enabled.getAsBoolean() && (accessibility==null || !accessibility.isTouchExplorationEnabled()); }
    private boolean inSide(MotionEvent e) {
        return side.getVisibility()==View.VISIBLE && e.getX()>=side.getLeft() && e.getX()<side.getRight()
            && e.getY()>=side.getTop() && e.getY()<side.getBottom();
    }
    @Override public boolean onInterceptTouchEvent(MotionEvent e) {
        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_DOWN -> {
                ownsTouch=false; sideInteraction=false; endpointHaptics.end(); gesture.cancel();
                if (!available() || e.getPointerCount()!=1 || inSide(e)) return false;
                float top=controlsVisible ? Math.max(dp(64),topInset+dp(64*Math.max(1,getResources().getConfiguration().fontScale))) : 0;
                float bottom=controlsVisible ? (Float.isFinite(controlsTop) ? controlsTop : getHeight()-Math.max(dp(136),bottomInset+dp(112))) : getHeight();
                gesture.begin(e.getX(),e.getY(),getWidth(),getHeight(),top,bottom,leftEdge,rightEdge,
                    player!=null && player.canScrub());
                downX=e.getX();
            }
            case MotionEvent.ACTION_MOVE -> {
                if (!available() || e.getPointerCount()!=1) { gesture.cancel(); return false; }
                var mode=gesture.move(e.getX(),e.getY());
                if (mode==SideSwipeGesture.Mode.SCRUB && !scrubbing) {
                    scrubSession=player.session();
                    long duration=player.durationMs(), at=player.positionMs();
                    scrubbing=player.beginScrub(scrubSession);
                    if (!scrubbing) { gesture.cancel(); return false; }
                    hide(); scrubTarget=at; scrubX=e.getX();
                    scrub.begin(at,duration,downX,getWidth(),getHeight());
                }
                ownsTouch=mode!=SideSwipeGesture.Mode.NONE;
                if (ownsTouch && mode!=SideSwipeGesture.Mode.SCRUB && !sideInteraction) beginSideControl(mode);
                return ownsTouch;
            }
            case MotionEvent.ACTION_POINTER_DOWN, MotionEvent.ACTION_CANCEL, MotionEvent.ACTION_UP -> gesture.cancel();
        }
        return false;
    }
    @Override public void requestDisallowInterceptTouchEvent(boolean disallow) {
        if (disallow && gesture.canCapture()) return;
        super.requestDisallowInterceptTouchEvent(disallow);
    }
    @SuppressLint("ClickableViewAccessibility") // Taps remain in the WebView; only recognized drags are consumed.
    @Override public boolean onTouchEvent(MotionEvent e) {
        if (!ownsTouch) return super.onTouchEvent(e);
        int action=e.getActionMasked();
        if (!available() || e.getPointerCount()!=1 || action==MotionEvent.ACTION_CANCEL) {
            finishScrub(false); gesture.cancel(); hide();
            if (action==MotionEvent.ACTION_CANCEL || action==MotionEvent.ACTION_UP) ownsTouch=false;
            return true;
        }
        if (action==MotionEvent.ACTION_MOVE || action==MotionEvent.ACTION_UP) adjust(e);
        if (action==MotionEvent.ACTION_UP) {
            finishScrub(true); ownsTouch=false; gesture.cancel(); finishSideControl();
        }
        return true;
    }
    private void adjust(MotionEvent e) {
        var mode=gesture.mode();
        if (mode==SideSwipeGesture.Mode.SCRUB && scrubbing) {
            scrubTarget=scrub.move(e.getX(),e.getY());
            scrubX=e.getX();
            if (!scrubFrameQueued) { scrubFrameQueued=true; postOnAnimation(scrubFrame); }
        } else if (mode!=SideSwipeGesture.Mode.NONE) {
            applyProgress(mode,gesture.value(normalized(initial),e.getY(),0));
        }
    }
    private void sendScrub(boolean active) { sendScrub(active,false); }
    private void sendScrub(boolean active,boolean commit) {
        emit.accept(NativePlayer.object("type","scrub","session",scrubSession,"active",active,
            "position",scrubTarget/1000.0,"duration",player.durationMs()/1000.0,"x",scrubX/density,"speed",scrub.speed(),"commit",commit));
    }
    private void finishScrub(boolean commit) {
        removeCallbacks(scrubFrame); scrubFrameQueued=false;
        if (scrubbing && player!=null) {
            sendScrub(false,commit);
            player.endScrub(scrubSession,commit,scrubTarget);
        }
        scrubbing=false;
    }
    private void beginSideControl(SideSwipeGesture.Mode mode) {
        if (!available()) return;
        sideInteraction=true;
        if (mode==SideSwipeGesture.Mode.BRIGHTNESS) initial=brightness.begin(preferredBrightness());
        else if (mode==SideSwipeGesture.Mode.VOLUME) sampleVolume();
        endpointHaptics.begin(normalized(initial));
        show(mode,initial);
    }
    private float normalized(float value) {
        return Math.max(0,Math.min(1,value));
    }
    private float preferredBrightness() {
        try { return normalized(Settings.System.getInt(activity.getContentResolver(),Settings.System.SCREEN_BRIGHTNESS,128)/255f); }
        catch (SecurityException restricted) { return .5f; }
    }
    private void sampleVolume() {
        if (audio==null || audio.isVolumeFixed()) return;
        minVolume=Build.VERSION.SDK_INT>=28 ? audio.getStreamMinVolume(AudioManager.STREAM_MUSIC) : 0;
        maxVolume=audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
        requestedVolume=audio.getStreamVolume(AudioManager.STREAM_MUSIC);
        initial=audio.isStreamMute(AudioManager.STREAM_MUSIC) ? 0 : (float)(requestedVolume-minVolume)/Math.max(1,maxVolume-minVolume);
    }
    private void applyProgress(SideSwipeGesture.Mode mode,float progress) {
        apply(mode,progress);
    }
    private void apply(SideSwipeGesture.Mode mode,float value) {
        if (!available() || !Float.isFinite(value)) return;
        value=normalized(value);
        float displayProgress=value;
        if (mode==SideSwipeGesture.Mode.BRIGHTNESS) {
            value=brightness.set(value);
        } else if (mode==SideSwipeGesture.Mode.VOLUME) {
            if (audio==null || audio.isVolumeFixed() || maxVolume<=minVolume) return;
            int volume=Math.round(minVolume+value*(maxVolume-minVolume));
            try {
                if (volume>minVolume && audio.isStreamMute(AudioManager.STREAM_MUSIC)) audio.adjustStreamVolume(AudioManager.STREAM_MUSIC,AudioManager.ADJUST_UNMUTE,0);
                if (volume!=requestedVolume) { audio.setStreamVolume(AudioManager.STREAM_MUSIC,volume,0); requestedVolume=volume; }
                int actual=audio.getStreamVolume(AudioManager.STREAM_MUSIC);
                value=(float)(actual-minVolume)/(maxVolume-minVolume);
                if (actual!=volume) displayProgress=value;
            } catch (SecurityException | IllegalArgumentException restricted) { gesture.cancel(); hide(); return; }
        } else return;
        show(mode,value,displayProgress);
    }
    private void toggleMute() {
        if (!available() || audio==null || audio.isVolumeFixed()) return;
        try {
            audio.adjustStreamVolume(AudioManager.STREAM_MUSIC,audio.isStreamMute(AudioManager.STREAM_MUSIC) ? AudioManager.ADJUST_UNMUTE : AudioManager.ADJUST_MUTE,0);
            sampleVolume(); sideInteraction=false; endpointHaptics.end(); show(SideSwipeGesture.Mode.VOLUME,initial);
        } catch (SecurityException | IllegalArgumentException restricted) { hide(); }
    }
    private void show(SideSwipeGesture.Mode mode,float value) { show(mode,value,normalized(value)); }
    private void show(SideSwipeGesture.Mode mode,float value,float displayProgress) {
        removeCallbacks(hideHud); shownMode=mode;
        float progress=normalized(value);
        side.update(mode==SideSwipeGesture.Mode.VOLUME,progress,displayProgress,
            audio!=null && audio.isStreamMute(AudioManager.STREAM_MUSIC),sideInteraction);
        if (endpointHaptics.update(displayProgress)) performHapticFeedback(Build.VERSION.SDK_INT>=34
            ? HapticFeedbackConstants.SEGMENT_TICK : HapticFeedbackConstants.CLOCK_TICK);
        var params=(LayoutParams)side.getLayoutParams();
        int height=Math.min(dp(232),Math.max(dp(160),getHeight()-dp(40)-Math.round(topInset+bottomInset)));
        int gravity=Gravity.CENTER_VERTICAL | (mode==SideSwipeGesture.Mode.BRIGHTNESS ? Gravity.LEFT : Gravity.RIGHT);
        int left=Math.max(dp(24),Math.round(leftEdge)), right=Math.max(dp(24),Math.round(rightEdge));
        if (params.height!=height || params.gravity!=gravity || params.leftMargin!=left || params.rightMargin!=right) {
            params.height=height; params.gravity=gravity; params.leftMargin=left; params.rightMargin=right;
            side.setLayoutParams(params);
        }
        side.setVisibility(View.VISIBLE);
        side.setHeld(sideInteraction);
    }
    private void finishSideControl() {
        sideInteraction=false; endpointHaptics.end(); side.settle(); scheduleHide();
    }
    private void scheduleBrightnessResume() {
        if (brightnessResumeQueued) return;
        brightnessResumeQueued=true;
        // One traversal must commit NONE before a later traversal restores the
        // video value. Two callbacks in the same frame would be coalesced.
        postOnAnimation(waitBrightnessFrame);
    }
    private void scheduleHide() { removeCallbacks(hideHud); postDelayed(hideHud,900); }
    private void hide() { endpointHaptics.end(); removeCallbacks(hideHud); side.setVisibility(View.GONE); }
    void pauseGestures() { finishScrub(false); ownsTouch=false; gesture.cancel(); hide(); }
    void setVideoActive(boolean active) {
        if (!active) {
            pauseGestures(); controlsTop=Float.NaN; controlsVisible=true;
            brightness.restore();
        }
    }
    @Override protected void onAttachedToWindow() {
        super.onAttachedToWindow();
        var resolver=activity.getContentResolver();
        resolver.registerContentObserver(Settings.System.getUriFor(Settings.System.SCREEN_BRIGHTNESS),false,systemBrightness);
        resolver.registerContentObserver(Settings.System.getUriFor(Settings.System.SCREEN_BRIGHTNESS_MODE),false,systemBrightness);
    }
    @Override public void onWindowFocusChanged(boolean hasWindowFocus) {
        super.onWindowFocusChanged(hasWindowFocus);
        removeCallbacks(waitBrightnessFrame); removeCallbacks(resumeBrightness); brightnessResumeQueued=false;
        if (hasWindowFocus) scheduleBrightnessResume();
        else { pauseGestures(); brightness.suspend(); }
    }
    @Override protected void onSizeChanged(int w,int h,int oldw,int oldh) { super.onSizeChanged(w,h,oldw,oldh); pauseGestures(); controlsTop=Float.NaN; }
    @Override protected void onDetachedFromWindow() {
        removeCallbacks(waitBrightnessFrame); removeCallbacks(resumeBrightness); brightnessResumeQueued=false;
        activity.getContentResolver().unregisterContentObserver(systemBrightness);
        setVideoActive(false); super.onDetachedFromWindow();
    }
}
