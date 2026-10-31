package app.navigator.android;

import org.junit.Test;
import static org.junit.Assert.*;

public class SideSwipeGestureTest {
    private SideSwipeGesture begin(float x, float y) {
        var gesture = new SideSwipeGesture(1, 8);
        gesture.begin(x, y, 1000, 500, 64, 364, 24, 24);
        return gesture;
    }
    @Test public void verticalSideSwipesAdjustTheExpectedSetting() {
        var left = begin(200, 200);
        assertEquals(SideSwipeGesture.Mode.NONE, left.move(202, 192));
        assertEquals(SideSwipeGesture.Mode.BRIGHTNESS, left.move(202, 150));
        assertEquals(.7f, left.value(.5f, 150, .02f), .001f);
        assertEquals(.3f, left.value(.5f, 250, .02f), .001f);
        var right = begin(800, 200);
        assertEquals(SideSwipeGesture.Mode.VOLUME, right.move(800, 150));
        assertEquals(.7f, right.value(.5f, 150, 0), .001f);
    }
    @Test public void backEdgesButtonsAndCenterNeverBecomeSideGestures() {
        for (float[] point : new float[][]{{10, 200}, {990, 200}, {500, 200}, {200, 40}, {800, 400}}) {
            var gesture = begin(point[0], point[1]);
            assertEquals(SideSwipeGesture.Mode.NONE, gesture.move(point[0], point[1] - 80));
        }
        var inset = new SideSwipeGesture(1, 8);
        assertEquals(SideSwipeGesture.Mode.NONE, inset.begin(40, 150, 1000, 500, 64, 364, 60, 60));
    }
    @Test public void horizontalMovementCancelsAndValuesStayWithinBounds() {
        var horizontal = begin(200, 200);
        assertEquals(SideSwipeGesture.Mode.NONE, horizontal.move(250, 190));
        assertEquals(SideSwipeGesture.Mode.NONE, horizontal.move(250, 100));
        var vertical = begin(200, 200);
        vertical.move(200, 100);
        assertEquals(1, vertical.value(.8f, -500, .02f), 0);
        assertEquals(.02f, vertical.value(.2f, 1000, .02f), 0);
        assertEquals(0, vertical.value(.2f, 1000, 0), 0);
        vertical.cancel(); assertEquals(SideSwipeGesture.Mode.NONE, vertical.mode());
    }
    @Test public void densityAndActualToolbarBandAreRespected() {
        var scaled = new SideSwipeGesture(2, 16);
        assertEquals(SideSwipeGesture.Mode.NONE, scaled.begin(30, 300, 2000, 1000, 128, 728, 48, 48));
        scaled.begin(400, 400, 2000, 1000, 128, 728, 48, 48);
        scaled.move(400, 300);
        assertEquals(.7f, scaled.value(.5f, 300, .02f), .001f);
        assertEquals(SideSwipeGesture.Mode.NONE, scaled.begin(400, 650, 2000, 1000, 128, 600, 48, 48));
    }
}
