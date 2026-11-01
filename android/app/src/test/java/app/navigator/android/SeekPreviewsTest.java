package app.navigator.android;

import androidx.media3.common.util.UnstableApi;
import org.junit.Test;
import static org.junit.Assert.*;

@UnstableApi
public class SeekPreviewsTest {
    @Test public void previewTimesStayWithinFiftyMillisecondsOfTheSeek() {
        for (long ms=0; ms<120_000; ms+=37) {
            assertTrue(Math.abs(SeekPreviews.bucket(ms)-ms)<=50);
            assertEquals(0, SeekPreviews.bucket(ms)%100);
        }
    }
    @Test public void bridgeFloatingPointRoundingCannotChangeTheBucket() {
        assertEquals(79_900, SeekPreviews.bucket((long)(79.9*1000)));
        assertEquals(0, SeekPreviews.bucket(-100));
    }
}
