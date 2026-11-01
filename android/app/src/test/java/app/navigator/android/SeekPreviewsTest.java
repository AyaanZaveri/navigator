package app.navigator.android;

import androidx.media3.common.util.UnstableApi;
import org.junit.Test;
import static org.junit.Assert.*;

@UnstableApi
public class SeekPreviewsTest {
    @Test public void previewTimesStayWithinOneSecondOfTheSeek() {
        for (long ms=0; ms<120_000; ms+=37) {
            assertTrue(Math.abs(SeekPreviews.bucket(ms)-ms)<=500);
            assertEquals(0, SeekPreviews.bucket(ms)%1000);
        }
    }
    @Test public void bridgeFloatingPointRoundingCannotChangeTheBucket() {
        assertEquals(80_000, SeekPreviews.bucket((long)(79.9*1000)));
        assertEquals(0, SeekPreviews.bucket(-100));
    }
}
