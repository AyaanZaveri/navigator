package app.navigator.android;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.media.AudioManager;
import android.os.Build;
import android.provider.Settings;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.accessibility.AccessibilityManager;
import android.widget.FrameLayout;
import androidx.media3.common.util.UnstableApi;

import java.util.function.BooleanSupplier;

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
    private final ScrubPreviewView preview;
    private final Runnable hideHud;
    private NativePlayer player;
    private float topInset, bottomInset, leftEdge, rightEdge, downX;
    private float controlsTop = Float.NaN, initial;
    private Float savedBrightness;
    private float appliedBrightness = Float.NaN;
    private int minVolume, maxVolume, requestedVolume;
    private SideSwipeGesture.Mode shownMode = SideSwipeGesture.Mode.NONE;
    private boolean ownsTouch, controlsVisible = true, scrubbing;
    private String scrubSession;
    private long scrubTarget;

    PlayerGestureLayout(Activity activity, BooleanSupplier enabled) {
        super(activity); this.activity = activity; this.enabled = enabled;
        density = getResources().getDisplayMetrics().density;
        audio = activity.getSystemService(AudioManager.class);
        accessibility = activity.getSystemService(AccessibilityManager.class);
        gesture = new SideSwipeGesture(density, ViewConfiguration.get(activity).getScaledTouchSlop());
        hideHud = () -> { sideView().setVisibility(View.GONE); previewView().hide(); };
        side = new SideControlView(activity, value -> apply(shownMode,value), this::toggleMute,
            () -> { removeCallbacks(hideHud); if (shownMode==SideSwipeGesture.Mode.VOLUME) sampleVolume(); }, this::scheduleHide);
        preview = new ScrubPreviewView(activity);
    }
    private SideControlView sideView() { return side; }
    private ScrubPreviewView previewView() { return preview; }
    private int dp(float value) { return Math.round(value*density); }
    void setPlayer(NativePlayer value) { player = value; }
    void installHud() {
        addView(preview,new LayoutParams(-1,-1));
        addView(side,new LayoutParams(dp(56),dp(232)));
    }
    void setGestureInsets(float top,float bottom,float left,float right) { topInset=top; bottomInset=bottom; leftEdge=left; rightEdge=right; }
    void setControlsTop(float value) { controlsTop=value; }
    void setControlsVisible(boolean value) {
        controlsVisible=value;
        if (value && scrubbing) pauseGestures();
        if (!value && player != null && available()) player.warmPreview();
    }
    private boolean available() { return enabled.getAsBoolean() && (accessibility==null || !accessibility.isTouchExplorationEnabled()); }
    private boolean inSide(MotionEvent e) {
        return side.getVisibility()==View.VISIBLE && e.getX()>=side.getLeft() && e.getX()<side.getRight()
            && e.getY()>=side.getTop() && e.getY()<side.getBottom();
    }
    @Override public boolean onInterceptTouchEvent(MotionEvent e) {
        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_DOWN -> {
                ownsTouch=false; gesture.cancel();
                if (!available() || e.getPointerCount()!=1 || inSide(e)) return false;
                float top=controlsVisible ? Math.max(dp(64),topInset+dp(64*Math.max(1,getResources().getConfiguration().fontScale))) : 0;
                float bottom=controlsVisible ? (Float.isFinite(controlsTop) ? controlsTop : getHeight()-Math.max(dp(136),bottomInset+dp(112))) : getHeight();
                var mode=gesture.begin(e.getX(),e.getY(),getWidth(),getHeight(),top,bottom,leftEdge,rightEdge,
                    !controlsVisible && player!=null && player.canScrub());
                downX=e.getX();
                if (mode==SideSwipeGesture.Mode.VOLUME) sampleVolume();
                else if (mode==SideSwipeGesture.Mode.BRIGHTNESS) initial=currentBrightness();
            }
            case MotionEvent.ACTION_MOVE -> {
                if (!available() || e.getPointerCount()!=1) { gesture.cancel(); return false; }
                var mode=gesture.move(e.getX(),e.getY());
                if (mode==SideSwipeGesture.Mode.SCRUB && !scrubbing) {
                    scrubSession=player.session();
                    long duration=player.durationMs(), at=player.positionMs();
                    scrubbing=player.beginScrub(scrubSession);
                    if (!scrubbing) { gesture.cancel(); return false; }
                    hide(); preview.begin(at,duration,bottomInset);
                    scrub.begin(at,duration,downX,getWidth(),getHeight());
                }
                ownsTouch=mode!=SideSwipeGesture.Mode.NONE;
                if (ownsTouch) adjust(e);
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
            finishScrub(true); ownsTouch=false; gesture.cancel(); scheduleHide();
        }
        return true;
    }
    private void adjust(MotionEvent e) {
        var mode=gesture.mode();
        if (mode==SideSwipeGesture.Mode.SCRUB && scrubbing) {
            scrubTarget=scrub.move(e.getX(),e.getY());
            preview.progress(scrubTarget,e.getY()/Math.max(1,getHeight()));
            player.preview(scrubSession,scrubTarget,bitmap -> { if (scrubbing && player.session().equals(scrubSession)) preview.frame(bitmap); });
        } else if (mode!=SideSwipeGesture.Mode.NONE) {
            apply(mode,gesture.value(initial,e.getY(),mode==SideSwipeGesture.Mode.BRIGHTNESS ? .02f : 0));
        }
    }
    private void finishScrub(boolean commit) {
        if (scrubbing && player!=null) player.endScrub(scrubSession,commit,scrubTarget);
        scrubbing=false;
    }
    private float currentBrightness() {
        float value=activity.getWindow().getAttributes().screenBrightness;
        if (value<0) {
            try { value=Settings.System.getInt(activity.getContentResolver(),Settings.System.SCREEN_BRIGHTNESS,128)/255f; }
            catch (SecurityException restricted) { value=.5f; }
        }
        return Math.max(.02f,Math.min(1,value));
    }
    private void sampleVolume() {
        if (audio==null || audio.isVolumeFixed()) return;
        minVolume=Build.VERSION.SDK_INT>=28 ? audio.getStreamMinVolume(AudioManager.STREAM_MUSIC) : 0;
        maxVolume=audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
        requestedVolume=audio.getStreamVolume(AudioManager.STREAM_MUSIC);
        initial=audio.isStreamMute(AudioManager.STREAM_MUSIC) ? 0 : (float)(requestedVolume-minVolume)/Math.max(1,maxVolume-minVolume);
    }
    private void apply(SideSwipeGesture.Mode mode,float value) {
        if (!available() || !Float.isFinite(value)) return;
        value=Math.max(mode==SideSwipeGesture.Mode.BRIGHTNESS ? .02f : 0,Math.min(1,value));
        if (mode==SideSwipeGesture.Mode.BRIGHTNESS) {
            if (!Float.isFinite(appliedBrightness) || Math.abs(value-appliedBrightness)>=.005f) {
                var attrs=activity.getWindow().getAttributes();
                if (savedBrightness==null) savedBrightness=attrs.screenBrightness;
                attrs.screenBrightness=value; activity.getWindow().setAttributes(attrs); appliedBrightness=value;
            }
        } else if (mode==SideSwipeGesture.Mode.VOLUME) {
            if (audio==null || audio.isVolumeFixed() || maxVolume<=minVolume) return;
            int volume=Math.round(minVolume+value*(maxVolume-minVolume));
            try {
                if (volume>minVolume && audio.isStreamMute(AudioManager.STREAM_MUSIC)) audio.adjustStreamVolume(AudioManager.STREAM_MUSIC,AudioManager.ADJUST_UNMUTE,0);
                if (volume!=requestedVolume) { audio.setStreamVolume(AudioManager.STREAM_MUSIC,volume,0); requestedVolume=volume; }
                value=(float)(audio.getStreamVolume(AudioManager.STREAM_MUSIC)-minVolume)/(maxVolume-minVolume);
            } catch (SecurityException | IllegalArgumentException restricted) { gesture.cancel(); hide(); return; }
        } else return;
        show(mode,value);
    }
    private void toggleMute() {
        if (!available() || audio==null || audio.isVolumeFixed()) return;
        try {
            audio.adjustStreamVolume(AudioManager.STREAM_MUSIC,audio.isStreamMute(AudioManager.STREAM_MUSIC) ? AudioManager.ADJUST_UNMUTE : AudioManager.ADJUST_MUTE,0);
            sampleVolume(); show(SideSwipeGesture.Mode.VOLUME,initial);
        } catch (SecurityException | IllegalArgumentException restricted) { hide(); }
    }
    private void show(SideSwipeGesture.Mode mode,float value) {
        removeCallbacks(hideHud); shownMode=mode;
        side.update(mode==SideSwipeGesture.Mode.VOLUME,value,audio!=null && audio.isStreamMute(AudioManager.STREAM_MUSIC));
        var params=(LayoutParams)side.getLayoutParams();
        int height=Math.min(dp(232),Math.max(dp(160),getHeight()-dp(40)-Math.round(topInset+bottomInset)));
        int gravity=Gravity.CENTER_VERTICAL | (mode==SideSwipeGesture.Mode.BRIGHTNESS ? Gravity.LEFT : Gravity.RIGHT);
        int left=Math.max(dp(24),Math.round(leftEdge)), right=Math.max(dp(24),Math.round(rightEdge));
        if (params.height!=height || params.gravity!=gravity || params.leftMargin!=left || params.rightMargin!=right) {
            params.height=height; params.gravity=gravity; params.leftMargin=left; params.rightMargin=right;
            side.setLayoutParams(params);
        }
        side.setVisibility(View.VISIBLE);
    }
    private void scheduleHide() { removeCallbacks(hideHud); postDelayed(hideHud,900); }
    private void hide() { removeCallbacks(hideHud); side.setVisibility(View.GONE); preview.hide(); }
    void pauseGestures() { finishScrub(false); ownsTouch=false; gesture.cancel(); hide(); }
    void setVideoActive(boolean active) {
        if (!active) {
            pauseGestures(); controlsTop=Float.NaN; controlsVisible=true;
            if (savedBrightness!=null) {
                var attrs=activity.getWindow().getAttributes(); attrs.screenBrightness=savedBrightness;
                activity.getWindow().setAttributes(attrs); savedBrightness=null; appliedBrightness=Float.NaN;
            }
        }
    }
    @Override protected void onSizeChanged(int w,int h,int oldw,int oldh) { super.onSizeChanged(w,h,oldw,oldh); pauseGestures(); controlsTop=Float.NaN; }
    @Override protected void onDetachedFromWindow() { setVideoActive(false); super.onDetachedFromWindow(); }
}
