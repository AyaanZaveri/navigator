package app.navigator.android;

import org.junit.Test;
import static org.junit.Assert.*;

public class PlaybackBrightnessTest {
    // Models LayoutParams.copyFrom / OverrideBrightnessStrategy: identical
    // attributes may be discarded even if Quick Settings changed the display.
    private static final class Window implements PlaybackBrightness.Window {
        float value=-1, system=.01f, display=.01f; int writes;
        @Override public float read() { return value; }
        @Override public void write(float brightness) {
            writes++;
            if (brightness!=value) { value=brightness; display=value<0 ? system : value; }
        }
        void quickSettings(float brightness) { system=display=brightness; }
    }
    @Test public void quickSettingsHandoffRestoresAFullOverrideAndFurtherDragsWork() {
        var w=new Window(); var b=new PlaybackBrightness(w);
        b.begin(.01f); b.set(1); assertEquals(1,w.display,0);
        w.quickSettings(.01f); b.reapply();
        assertEquals(.01f,w.display,0); // Reproduces the old same-attribute failure.
        b.suspend(); assertEquals(-1,w.value,0);
        b.systemChanged(); b.reapply(); assertEquals(1,w.display,0);
        b.begin(.01f); b.set(.4f); assertEquals(.4f,w.display,0);
        b.set(1); assertEquals(1,w.display,0);
        b.restore(); assertEquals(.01f,w.display,0);
    }
    @Test public void repeatedManualEditsAndFocusCyclesKeepTheVideoValue() {
        var w=new Window(); var b=new PlaybackBrightness(w); b.set(.8f);
        for (float setting : new float[]{.01f,.9f,.05f,.3f}) {
            b.suspend(); w.quickSettings(setting); b.systemChanged(); b.reapply();
            assertEquals(.8f,w.display,0);
            assertEquals(.8f,b.begin(setting),0); // Does not rebase/cap the video to the phone setting.
        }
    }
    @Test public void requestsWhileSuspendedWaitForFocusAndLatestValueWins() {
        var w=new Window(); var b=new PlaybackBrightness(w);
        b.set(.5f); b.suspend(); int writes=w.writes;
        b.set(.6f); b.set(1); assertEquals(writes,w.writes); assertEquals(-1,w.value,0);
        b.reapply(); assertEquals(1,w.value,0);
    }
    @Test public void closingDuringAHandoffCannotReapplyTheOldVideoValue() {
        var w=new Window(); var b=new PlaybackBrightness(w);
        b.set(1); b.suspend(); w.quickSettings(.2f); b.systemChanged(); b.restore();
        int writes=w.writes; b.reapply(); assertEquals(writes,w.writes);
        assertEquals(.2f,w.display,0);
    }
    @Test public void fullOverrideAndRestorationAreAbsoluteAndEndpointsAreExact() {
        var w=new Window(); var b=new PlaybackBrightness(w);
        b.begin(.01f); b.set(.997f); assertEquals(1,b.set(1),0);
        assertEquals(0,b.set(0),0); assertEquals(0,w.value,0);
        b.suspend(); b.reapply(); assertEquals(0,w.display,0);
        b.restore(); assertEquals(-1,w.value,0);
        w.write(.2f); b.begin(.2f); b.set(1); b.restore(); assertEquals(.2f,w.value,0);
    }
    @Test public void invalidInputCannotReachTheWindow() {
        var w=new Window(); var b=new PlaybackBrightness(w); b.set(.8f);
        b.set(Float.NaN); b.set(Float.POSITIVE_INFINITY); assertEquals(.8f,w.value,0);
        assertEquals(0,b.set(-3),0); assertEquals(1,b.set(3),0);
    }
}
