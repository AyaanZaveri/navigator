package app.navigator.playbackdemo;

import android.app.Activity;
import android.content.Intent;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

/** Optional connected-device test; no emulator is started by this project. */
@RunWith(AndroidJUnit4.class)
public class PlaybackDemoTest {
    private WebView findWeb(View view) {
        if (view instanceof WebView) return (WebView) view;
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) {
                WebView found = findWeb(group.getChildAt(i));
                if (found != null) return found;
            }
        }
        return null;
    }

    private String evaluate(WebView web, String script) throws Exception {
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> web.evaluateJavascript(script, value -> { result.set(value); done.countDown(); }));
        assertTrue("WebView responded", done.await(5, TimeUnit.SECONDS));
        return result.get();
    }

    private void await(WebView web, String condition) throws Exception {
        long deadline = System.currentTimeMillis() + 20000;
        while (System.currentTimeMillis() < deadline) {
            if ("true".equals(evaluate(web, "Boolean(" + condition + ")"))) return;
            Thread.sleep(100);
        }
        fail("Timed out: " + condition);
    }

    @Test public void nextControlsDriveNativePlayback() throws Exception {
        var instrumentation = InstrumentationRegistry.getInstrumentation();
        Intent intent = new Intent(instrumentation.getTargetContext(), MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        Activity activity = instrumentation.startActivitySync(intent);
        try {
            AtomicReference<WebView> ref = new AtomicReference<>();
            instrumentation.runOnMainSync(() -> ref.set(findWeb(activity.getWindow().getDecorView())));
            WebView web = ref.get();
            assertNotNull("Transparent WebView exists", web);
            await(web, "document.querySelector('[data-testid=toggle]')?.getAttribute('aria-label') === 'Pause'");
            await(web, "document.querySelector('.badge')?.textContent === 'Native video'");
            evaluate(web, "document.querySelector('[data-testid=toggle]').click()");
            await(web, "document.querySelector('[data-testid=toggle]')?.getAttribute('aria-label') === 'Play'");
            evaluate(web, "(() => { const range = document.querySelector('#seek'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(range, '7000'); range.dispatchEvent(new Event('input', { bubbles: true })); range.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); })()");
            await(web, "document.querySelector('.time')?.textContent.startsWith('0:07')");
            evaluate(web, "document.querySelector('[data-testid=sample-sdr]').click()");
            await(web, "document.querySelector('[data-testid=toggle]')?.getAttribute('aria-label') === 'Pause'");
            assertEquals("No HTML video decoder is used", "0", evaluate(web, "document.querySelectorAll('video').length"));
        } finally { instrumentation.runOnMainSync(activity::finish); }
    }
}
