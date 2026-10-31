package app.navigator.android;

/** Absolute window override: the phone's preferred brightness is only a fallback. */
final class PlaybackBrightness {
    interface Window {
        float read();
        void write(float brightness);
    }
    private final Window window;
    private Float original, requested;
    private boolean systemChanged;
    PlaybackBrightness(Window window) { this.window=window; }
    float begin(float preferred) {
        float actual=window.read();
        float initial=requested!=null && !systemChanged ? requested : actual>=0 && !systemChanged ? actual : preferred;
        systemChanged=false;
        return set(initial);
    }
    void systemChanged() { if (requested!=null) systemChanged=true; }
    float set(float value) {
        if (!Float.isFinite(value)) return window.read();
        value=Math.max(.02f,Math.min(1,value));
        if (original==null) original=window.read();
        requested=value;
        // The same LayoutParams value can outlive a manual display adjustment.
        // Reassert every requested value, including an unchanged maximum.
        window.write(value);
        return window.read();
    }
    void reapply() { if (requested!=null) window.write(requested); }
    void restore() {
        if (original==null) return;
        window.write(original); original=requested=null; systemChanged=false;
    }
}
