package app.navigator.android;

/** Owns an absolute video-window override, releasing it while system UI has focus. */
final class PlaybackBrightness {
    interface Window {
        float read();
        void write(float brightness);
    }
    private final Window window;
    private Float original, requested;
    private boolean suspended;
    PlaybackBrightness(Window window) { this.window=window; }
    float begin(float preferred) {
        float actual=window.read();
        return set(requested!=null ? requested : actual>=0 ? actual : preferred);
    }
    float set(float value) {
        if (!Float.isFinite(value)) return requested!=null ? requested : window.read();
        value=Math.max(.02f,Math.min(1,value));
        if (original==null) original=window.read();
        requested=value;
        if (!suspended) window.write(value);
        return value;
    }
    void suspend() {
        if (requested!=null && !suspended) window.write(-1);
        suspended=true;
    }
    void systemChanged() { suspend(); }
    void reapply() {
        suspended=false;
        if (requested!=null) window.write(requested);
    }
    void restore() {
        if (original!=null) window.write(original);
        original=requested=null;
    }
}
