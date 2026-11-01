package app.navigator.android;

import org.junit.Test;
import java.util.HashSet;
import static org.junit.Assert.*;

public class ThumbnailWarmPlanTest {
    @Test public void fillsEverySampleInBufferedWindowWithoutRepeatingCachedFrames() {
        var cached = new HashSet<Long>();
        for (long at=10_000; at<=29_000; at+=1000) {
            assertEquals(Long.valueOf(at), ThumbnailWarmPlan.next(10_100,30_000,120_000,cached::contains));
            cached.add(at);
        }
        assertNull(ThumbnailWarmPlan.next(10_100,30_000,120_000,cached::contains));
    }
    @Test public void limitsReadAheadAndNeverGeneratesBeyondBufferedContentOrDuration() {
        assertNull(ThumbnailWarmPlan.next(20_000,20_100,120_000,at -> false));
        assertNull(ThumbnailWarmPlan.next(119_900,120_000,120_000,at -> false));
        var cached = new HashSet<Long>();
        Long next;
        while ((next=ThumbnailWarmPlan.next(10_000,600_000,600_000,cached::contains))!=null) cached.add(next);
        assertEquals(121,cached.size());
        assertTrue(cached.contains(130_000L));
        assertFalse(cached.contains(131_000L));
    }
    @Test public void backgroundWorkHasRestEvenOnFastDevicesAndBacksOffOnSlowOnes() {
        assertEquals(200,ThumbnailWarmPlan.restAfter(1));
        for (long work=0; work<=1000; work++) assertTrue(ThumbnailWarmPlan.restAfter(work)>=3*work);
    }
}
