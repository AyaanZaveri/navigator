package app.navigator.android;

/** Incremental, one-to-one tracking. Reversing at a limit has no stored overshoot. */
final class SliderDrag {
    private float value, lastY, span, minimum;
    void begin(float value,float y,float span,float minimum) {
        this.minimum=minimum; this.value=Math.max(minimum,Math.min(1,value));
        lastY=y; this.span=Math.max(1,span);
    }
    float move(float y) {
        value=Math.max(minimum,Math.min(1,value+(lastY-y)/span));
        lastY=y; return value;
    }
}
