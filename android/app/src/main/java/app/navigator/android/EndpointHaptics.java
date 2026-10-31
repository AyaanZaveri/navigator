package app.navigator.android;

/** One tick on entering a limit; a small retreat rearms it without edge chatter. */
final class EndpointHaptics {
    private boolean active;
    private int zone;
    void begin(float value) { active=true; zone=edge(value); }
    boolean update(float value) {
        if (!active || !Float.isFinite(value)) return false;
        int next=edge(value);
        if (next!=0 && next!=zone) { zone=next; return true; }
        if (value>.03f && value<.97f) zone=0;
        return false;
    }
    void end() { active=false; }
    private static int edge(float value) { return value<=.0001f ? -1 : value>=.9999f ? 1 : 0; }
}
