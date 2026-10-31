package app.navigator.android;

import org.junit.Test;
import static org.junit.Assert.*;

public class ScrubGestureTest {
    @Test public void verticalOnlyMovementNeverChangesPositionAndSpeedChangesMidDrag() {
        var g=new ScrubGesture(); g.begin(1_800_000,3_600_000,500,1000,500);
        assertEquals(1_803_000,g.move(600,0));
        assertEquals(1_803_000,g.move(600,500));
        assertEquals(1_863_000,g.move(700,500));
        assertEquals(1_863_000,g.move(700,0));
        assertEquals(1_860_000,g.move(600,0));
    }
    @Test public void reversalClampsAtBothEndsAndNeverAccumulatesOvershoot() {
        var g=new ScrubGesture(); g.begin(1000,60_000,500,1000,500);
        assertEquals(0,g.move(0,500));
        assertEquals(6000,g.move(100,500));
        assertEquals(60_000,g.move(2000,500));
        assertEquals(54_000,g.move(1900,500));
    }
    @Test public void shortClipsAndOutOfBoundsHeightAreFinite() {
        var g=new ScrubGesture(); g.begin(500,1000,0,1000,500);
        assertEquals(505,g.move(100,-500));
        assertEquals(605,g.move(200,1000));
        g.begin(0,0,0,0,0); assertEquals(0,g.move(100,100));
    }
}
