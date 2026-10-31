package app.navigator.android;

import org.junit.Test;
import java.net.URI;
import java.util.Map;
import static org.junit.Assert.*;

public class StreamPolicyTest {
    @Test public void onlyHttpMediaAndHttpsWebOriginsAreAccepted() {
        assertEquals("http", StreamPolicy.streamUrl("http://media.test/movie.mkv?token=example").getScheme());
        assertEquals("https", StreamPolicy.webOrigin("https://navigator.test/").getScheme());
        for (String invalid : new String[]{"file:///etc/passwd", "content://media/1", "javascript:alert(1)", "https://user:pass@media.test/video", "https://media.test:70000/video", "https://media.test/\nvideo", "not a URL"}) {
            assertThrows(IllegalArgumentException.class, () -> StreamPolicy.streamUrl(invalid));
        }
        for (String invalid : new String[]{"http://navigator.test", "https://navigator.test/login", "https://navigator.test?token=secret", "https://navigator.test#fragment"}) {
            assertThrows(IllegalArgumentException.class, () -> StreamPolicy.webOrigin(invalid));
        }
    }
    @Test public void originChecksIncludeSchemeHostAndEffectivePort() {
        URI base = URI.create("https://navigator.test");
        assertTrue(StreamPolicy.sameOrigin(base, URI.create("https://NAVIGATOR.test:443/login")));
        assertFalse(StreamPolicy.sameOrigin(base, URI.create("http://navigator.test")));
        assertFalse(StreamPolicy.sameOrigin(base, URI.create("https://navigator.test:444")));
        assertFalse(StreamPolicy.sameOrigin(base, URI.create("https://navigator.test.attacker.test")));
    }
    @Test public void headersRejectInjectionAndTransportOverrides() {
        assertEquals("https://addon.test", StreamPolicy.headers(Map.of("Referer", "https://addon.test")).get("Referer"));
        for (String name : new String[]{"Host", "Content-Length", "Connection", "Bad Header", "X-\r\nInjected"}) {
            assertThrows(IllegalArgumentException.class, () -> StreamPolicy.headers(Map.of(name, "value")));
        }
        assertThrows(IllegalArgumentException.class, () -> StreamPolicy.headers(Map.of("Authorization", "token\r\nX-Evil: yes")));
        assertThrows(IllegalArgumentException.class, () -> StreamPolicy.headers(Map.of("X-Key", "x".repeat(8193))));
    }
}
