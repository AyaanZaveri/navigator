package app.navigator.android;

import org.junit.Test;
import static org.junit.Assert.*;

public class SliderDragTest {
    @Test public void aFingerMovementMatchesTheSameDistanceOnTheTrack() {
        var drag=new SliderDrag(); drag.begin(.5f,200,160,0);
        assertEquals(.5f,drag.move(200),.0001f);
        assertEquals(.75f,drag.move(160),.0001f);
        assertEquals(.25f,drag.move(240),.0001f);
    }
    @Test public void reversingAtEitherLimitRespondsImmediatelyWithoutStoredOvershoot() {
        var drag=new SliderDrag(); drag.begin(.5f,200,100,0);
        assertEquals(1,drag.move(0),0); assertEquals(1,drag.move(-100),0);
        assertEquals(.9f,drag.move(-90),.0001f);
        assertEquals(0,drag.move(300),0); assertEquals(0,drag.move(400),0);
        assertEquals(.1f,drag.move(390),.0001f);
    }
    @Test public void densityAndBrightnessVolumeRangesUseTheSameNormalizedSensitivity() {
        var a=new SliderDrag(); var b=new SliderDrag();
        a.begin(.4f,200,160,0); b.begin(.4f,600,480,0);
        assertEquals(a.move(160),b.move(480),.0001f);
    }
}
