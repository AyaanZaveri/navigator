package app.navigator.android;

/** Absolute window override: the phone's preferred brightness is only a fallback. */
final class PlaybackBrightness {
    interface Window {
        float read();
        void write(float brightness);
    }
    private final Window window;
    private Float original, requested;
    PlaybackBrightness(Window window) { this.window=window; }
    float set(float value) {
        if (!Float.isFinite(value)) return window.read();
        value=Math.max(.02f,Math.min(1,value));
        if (original==null) original=window.read();
        requested=value;
        float actual=window.read();
        // Compare the real attributes, not a cached request. Exact endpoints must
        // bypass drag coalescing so the HUD cannot say 100% for a lower override.
        if (Math.abs(value-actual)>=.005f || ((value==1 || value==.02f) && actual!=value)) window.write(value);
        return window.read();
    }
    void reapply() { if (requested!=null) window.write(requested); }
    void restore() {
        if (original==null) return;
        window.write(original); original=requested=null;
    }
}
