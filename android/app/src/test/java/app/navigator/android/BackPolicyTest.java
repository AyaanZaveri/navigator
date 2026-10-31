package app.navigator.android;

import org.junit.Test;
import static org.junit.Assert.*;

public class BackPolicyTest {
    @Test public void oneBackClosesVideoEvenWhenThereIsPageHistory() {
        assertEquals(BackPolicy.Action.CLOSE_PLAYER, BackPolicy.action(false, false, true, true));
        assertEquals(BackPolicy.Action.CLOSE_PLAYER, BackPolicy.action(false, false, true, false));
        // Fullscreen is deliberately not a destination: no extra Back is required.
    }
    @Test public void menusDismissBeforeThePageOrPlayer() {
        assertEquals(BackPolicy.Action.DISMISS_OVERLAY, BackPolicy.action(false, true, true, true));
        assertEquals(BackPolicy.Action.DISMISS_OVERLAY, BackPolicy.action(false, true, false, false));
        assertEquals(BackPolicy.Action.GO_BACK, BackPolicy.action(false, false, false, true));
    }
    @Test public void rootHandsBackToAndroidAndErrorsCanLeave() {
        assertEquals(BackPolicy.Action.SYSTEM, BackPolicy.action(false, false, false, false));
        assertEquals(BackPolicy.Action.LEAVE_ERROR, BackPolicy.action(true, true, true, true));
    }
}
