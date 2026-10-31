package app.navigator.android;

import org.junit.Test;
import static org.junit.Assert.*;

public class EndpointHapticsTest {
    @Test public void limitsTickOnceAndHoldingDoesNotRepeat() {
        var h=new EndpointHaptics(); h.begin(.5f);
        assertFalse(h.update(.8f)); assertTrue(h.update(1));
        for (int i=0;i<120;i++) assertFalse(h.update(1));
        assertFalse(h.update(.5f)); assertTrue(h.update(0));
        assertFalse(h.update(0));
    }
    @Test public void smallRetreatCannotChatterButLeavingTheLimitRearmsIt() {
        var h=new EndpointHaptics(); h.begin(.5f); assertTrue(h.update(1));
        assertFalse(h.update(.99f)); assertFalse(h.update(1));
        assertFalse(h.update(.95f)); assertTrue(h.update(1));
        assertFalse(h.update(.5f)); assertTrue(h.update(0));
        assertFalse(h.update(.01f)); assertFalse(h.update(0));
        assertFalse(h.update(.05f)); assertTrue(h.update(0));
    }
    @Test public void startingAtALimitAndCancelledGesturesDoNotBuzz() {
        var h=new EndpointHaptics(); h.begin(0); assertFalse(h.update(0));
        h.end(); assertFalse(h.update(1));
        h.begin(1); assertFalse(h.update(1)); assertFalse(h.update(Float.NaN));
        assertFalse(h.update(.5f)); assertTrue(h.update(1));
    }
}
