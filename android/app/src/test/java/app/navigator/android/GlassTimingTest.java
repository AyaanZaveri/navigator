package app.navigator.android;

import org.junit.Test;
import static org.junit.Assert.*;

public class GlassTimingTest {
    @Test public void captureAndEncodingTimeCountsTowardTheFramePeriod() {
        assertEquals(74, GlassTiming.delayAfter(10));
        assertEquals(90, GlassTiming.delayAfter(30));
    }
    @Test public void slowDevicesCannotAccumulateUnboundedCapturePressure() {
        for (long work = 0; work <= 1000; work++) {
            long total = work + GlassTiming.delayAfter(work);
            assertTrue(total >= 84);
            assertTrue(total >= work * 4);
            assertTrue(GlassTiming.delayAfter(work) >= 0);
        }
    }
}
