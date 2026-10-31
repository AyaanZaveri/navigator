package app.navigator.android;

import android.animation.ValueAnimator;
import android.os.Build;
import android.os.SystemClock;
import android.provider.Settings;
import android.view.View;
import android.view.animation.PathInterpolator;

/** Shared, small ease-out for native bar rendering; no hardware/player callbacks. */
final class PlayerBarGlide {
    private static final PathInterpolator EASE=new PathInterpolator(.23f,1,.32f,1);
    private final View view;
    private final SliderVisualValue visual=new SliderVisualValue(t -> EASE.getInterpolation((float)t));
    private boolean posted;
    private final Runnable frame=new Runnable() {
        @Override public void run() {
            posted=false;
            if (!view.isAttachedToWindow() || view.getVisibility()!=View.VISIBLE) return;
            visual.sample(SystemClock.uptimeMillis()); view.invalidate();
            if (visual.running()) schedule();
        }
    };
    PlayerBarGlide(View view) { this.view=view; }
    void to(float target) {
        long now=SystemClock.uptimeMillis();
        float scale=durationScale();
        if (scale<=0 || view.getVisibility()!=View.VISIBLE || !view.isAttachedToWindow()) {
            snap(target); return;
        }
        visual.retarget(target,now,Math.round(100*scale));
        view.invalidate();
        if (visual.running()) schedule();
    }
    void snap(float value) { cancel(); visual.snap(value,SystemClock.uptimeMillis()); view.invalidate(); }
    float value() { return visual.value(); }
    void cancel() { view.removeCallbacks(frame); posted=false; }
    private void schedule() { if (!posted) { posted=true; view.postOnAnimation(frame); } }
    private float durationScale() {
        if (Build.VERSION.SDK_INT>=33) return ValueAnimator.getDurationScale();
        try { return Settings.Global.getFloat(view.getContext().getContentResolver(),Settings.Global.ANIMATOR_DURATION_SCALE,1); }
        catch (SecurityException restricted) { return 1; }
    }
}
