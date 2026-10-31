package app.navigator.android;

import java.util.function.DoubleUnaryOperator;

/** Display-only interpolation. Sampling before retargeting avoids starvation
 * when input arrives on every frame; this class never applies a player value. */
final class SliderVisualValue {
    private final DoubleUnaryOperator easing;
    private float value, from, target;
    private long started, sampled, duration;
    SliderVisualValue(DoubleUnaryOperator easing) { this.easing=easing; }
    void snap(float target,long now) {
        if (!Float.isFinite(target)) return;
        value=from=this.target=Math.max(0,Math.min(1,target));
        started=sampled=now; duration=0;
    }
    void retarget(float target,long now,long duration) {
        if (!Float.isFinite(target)) return;
        sample(now); target=Math.max(0,Math.min(1,target));
        if (duration<=0) { snap(target,sampled); return; }
        if (this.target==target && this.duration==duration) return;
        from=value; this.target=target; started=sampled; this.duration=duration;
    }
    float sample(long now) {
        sampled=Math.max(sampled,now);
        double fraction=duration<=0 ? 1 : Math.min(1,(double)(sampled-started)/duration);
        value=fraction>=1 ? target : from+(target-from)*(float)easing.applyAsDouble(fraction);
        return value;
    }
    float value() { return value; }
    boolean running() { return value!=target; }
}
