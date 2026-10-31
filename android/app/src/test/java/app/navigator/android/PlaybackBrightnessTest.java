package app.navigator.android;

import org.junit.Test;
import static org.junit.Assert.*;

public class PlaybackBrightnessTest {
    private static final class Window implements PlaybackBrightness.Window {
        float value=-1; int writes;
        @Override public float read() { return value; }
        @Override public void write(float brightness) { value=brightness; writes++; }
    }
    @Test public void fullOverrideIsAbsoluteAndClosingRestoresThePhonePolicy() {
        var window=new Window(); var brightness=new PlaybackBrightness(window);
        // -1 delegates to the phone's policy, including a user setting of 20%.
        assertEquals(1,brightness.set(1),0);
        brightness.restore(); assertEquals(-1,window.value,0);
        int writes=window.writes; brightness.reapply(); assertEquals(writes,window.writes);
        window.value=.2f; brightness.set(1); assertEquals(1,window.value,0);
        brightness.restore(); assertEquals(.2f,window.value,0);
    }
    @Test public void resetWindowDoesNotLeaveTheBarAtAStaleFullValue() {
        var window=new Window(); var brightness=new PlaybackBrightness(window);
        brightness.set(1);
        window.value=.2f; // Focus/presentation code can replace the actual attributes.
        assertEquals(1,brightness.set(1),0);
    }
    @Test public void maximumIsExactEvenAfterAnAlmostFullValue() {
        var window=new Window(); var brightness=new PlaybackBrightness(window);
        brightness.set(.997f); assertEquals(1,brightness.set(1),0);
    }
    @Test public void focusReappliesTheActiveOverrideAndInvalidInputCannotReachTheWindow() {
        var window=new Window(); var brightness=new PlaybackBrightness(window);
        brightness.reapply(); assertEquals(0,window.writes);
        brightness.set(.8f); window.value=.2f;
        brightness.reapply(); assertEquals(.8f,window.value,0);
        brightness.set(Float.NaN); brightness.set(Float.POSITIVE_INFINITY);
        assertEquals(.8f,window.value,0);
        assertEquals(.02f,brightness.set(-3),0);
        assertEquals(1,brightness.set(3),0);
    }
}
