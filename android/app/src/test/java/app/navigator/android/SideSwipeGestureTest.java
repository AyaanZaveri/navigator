package app.navigator.android;

import org.junit.Test;
import static org.junit.Assert.*;

public class SideSwipeGestureTest {
    private SideSwipeGesture begin(float x,float y,boolean hidden) {
        var g=new SideSwipeGesture(1,8);
        g.begin(x,y,1000,500,hidden ? 0 : 64,hidden ? 500 : 364,24,24,hidden);
        return g;
    }
    @Test public void thirdsAndPhysicalEdgesSupportVerticalControls() {
        for (float x : new float[]{0,10,320}) {
            var g=begin(x,200,true);
            assertEquals(SideSwipeGesture.Mode.NONE,g.move(x,192));
            assertEquals(SideSwipeGesture.Mode.BRIGHTNESS,g.move(x,150));
            assertEquals(.7f,g.value(.5f,150,.02f),.001f);
        }
        for (float x : new float[]{680,990,1000}) assertEquals(SideSwipeGesture.Mode.VOLUME,begin(x,200,true).move(x,150));
    }
    @Test public void shownControlsProtectButtonsAndHiddenControlsReleaseTheirWholeBand() {
        assertEquals(SideSwipeGesture.Mode.NONE,begin(200,40,false).move(200,10));
        assertEquals(SideSwipeGesture.Mode.NONE,begin(800,400,false).move(800,350));
        assertEquals(SideSwipeGesture.Mode.BRIGHTNESS,begin(200,40,true).move(200,10));
        assertEquals(SideSwipeGesture.Mode.VOLUME,begin(800,480,true).move(800,430));
        assertEquals(SideSwipeGesture.Mode.NONE,begin(500,200,true).move(500,100));
    }
    @Test public void horizontalScrubRequiresHiddenControlsAndRespectsAndroidBackEdges() {
        assertEquals(SideSwipeGesture.Mode.NONE,begin(500,200,false).move(550,200));
        assertEquals(SideSwipeGesture.Mode.NONE,begin(10,200,true).move(90,200));
        assertEquals(SideSwipeGesture.Mode.NONE,begin(990,200,true).move(900,200));
        var g=begin(500,200,true);
        assertTrue(g.canCapture());
        assertEquals(SideSwipeGesture.Mode.SCRUB,g.move(540,200));
        assertEquals(SideSwipeGesture.Mode.SCRUB,g.move(540,10));
        assertEquals(SideSwipeGesture.Mode.SCRUB,g.move(480,490));
    }
    @Test public void diagonalIntentRemainsUndecidedThenLocksAndBoundsStaySafe() {
        var g=begin(200,200,true);
        assertEquals(SideSwipeGesture.Mode.NONE,g.move(220,220));
        assertEquals(SideSwipeGesture.Mode.BRIGHTNESS,g.move(220,150));
        assertEquals(SideSwipeGesture.Mode.BRIGHTNESS,g.move(500,150));
        assertEquals(1,g.value(.5f,-500,.02f),0);
        assertEquals(.02f,g.value(.5f,1000,.02f),0);
        g.cancel(); assertFalse(g.canCapture());
        var scaled=new SideSwipeGesture(2,16);
        scaled.begin(400,400,2000,1000,0,1000,48,48,true);
        assertEquals(SideSwipeGesture.Mode.NONE,scaled.move(420,400));
        assertEquals(SideSwipeGesture.Mode.SCRUB,scaled.move(440,400));
    }
}
