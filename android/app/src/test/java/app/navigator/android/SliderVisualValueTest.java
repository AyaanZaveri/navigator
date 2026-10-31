package app.navigator.android;

import org.junit.Test;
import static org.junit.Assert.*;

public class SliderVisualValueTest {
    @Test public void continuous120HzInputKeepsAdvancingInsteadOfRestartingAtZero() {
        var visual=new SliderVisualValue(t -> t); visual.snap(0,0);
        float previous=0,target=0;
        for (int i=1;i<=60;i++) {
            target=i/80f; visual.retarget(target,i*8,100);
            if (i>1) assertTrue(visual.value()>previous);
            assertTrue(visual.value()<=target); previous=visual.value();
        }
        assertEquals(target,visual.sample(580),.0001f); assertFalse(visual.running());
    }
    @Test public void reversingRetargetsFromTheCurrentRenderedPosition() {
        var visual=new SliderVisualValue(t -> t); visual.snap(.1f,0);
        visual.retarget(.9f,0,100); float position=visual.sample(40);
        visual.retarget(.2f,40,100); assertEquals(position,visual.value(),0);
        assertTrue(visual.sample(60)<position); assertTrue(visual.value()>.2f);
        assertEquals(.2f,visual.sample(140),0);
    }
    @Test public void repeatedTargetsDoNotPostponeArrivalAndReducedMotionSnaps() {
        var visual=new SliderVisualValue(t -> t); visual.snap(0,0);
        visual.retarget(1,0,100); visual.sample(90); visual.retarget(1,90,100);
        assertEquals(1,visual.sample(100),0); assertFalse(visual.running());
        visual.retarget(.4f,101,0); assertEquals(.4f,visual.value(),0); assertFalse(visual.running());
    }
    @Test public void olderFrameTimesAndInvalidTargetsCannotRewindOrCorruptTheBar() {
        var visual=new SliderVisualValue(t -> t); visual.snap(0,0); visual.retarget(1,0,100);
        assertEquals(.6f,visual.sample(60),.0001f); assertEquals(.6f,visual.sample(50),.0001f);
        visual.retarget(Float.NaN,70,100); assertEquals(1,visual.sample(100),0);
        visual.retarget(2,101,0); assertEquals(1,visual.value(),0);
        visual.retarget(-2,102,0); assertEquals(0,visual.value(),0);
    }
    @Test public void visualLagNeverBecomesTheNextBrightnessOrVolumeInput() {
        var input=new SliderDrag(); input.begin(.2f,100,100,0);
        var visual=new SliderVisualValue(t -> t); visual.snap(.2f,0);
        float applied=input.move(50); visual.retarget(applied,0,100);
        assertEquals(.7f,applied,.0001f); assertEquals(.2f,visual.value(),.0001f);
        visual.sample(50); assertEquals(.7f,applied,.0001f);
        assertEquals(.95f,input.move(25),.0001f);
    }
}
