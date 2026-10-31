package app.navigator.android;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;
import org.junit.Test;
import java.util.Map;
import java.util.LinkedHashMap;
import java.util.concurrent.TimeUnit;
import static org.junit.Assert.*;

public class ScopedHttpTest {
    @Test public void stoppingASessionCannotMutateAnInflightRequestsHeaders() throws Exception {
        try (MockWebServer server = new MockWebServer()) {
            server.start();
            server.enqueue(new MockResponse().setBody("video"));
            Map<String, String> headers = new LinkedHashMap<>();
            headers.put("X-Api-Key", "original");
            var client = ScopedHttp.forStream(new OkHttpClient(), server.url("/").uri(), headers);
            headers.clear();
            try (var response = client.newCall(new Request.Builder().url(server.url("/video.mp4")).build()).execute()) {
                assertEquals(200, response.code());
            }
            assertEquals("original", server.takeRequest(2, TimeUnit.SECONDS).getHeader("X-Api-Key"));
        }
    }
    @Test public void redirectsCannotForwardAddonCredentialsToAnotherOrigin() throws Exception {
        try (MockWebServer source = new MockWebServer(); MockWebServer cdn = new MockWebServer()) {
            source.start();
            cdn.start();
            source.enqueue(new MockResponse().setResponseCode(302).addHeader("Location", cdn.url("/segment.ts")));
            cdn.enqueue(new MockResponse().setBody("segment"));
            var client = ScopedHttp.forStream(new OkHttpClient(), source.url("/").uri(), Map.of(
                "Authorization", "Bearer addon-token", "Cookie", "stream=session", "X-Api-Key", "private-key", "Referer", "https://addon.test", "User-Agent", "Navigator-Test"));
            try (var response = client.newCall(new Request.Builder().url(source.url("/playlist.m3u8")).build()).execute()) {
                assertEquals(200, response.code());
                assertEquals("segment", response.body().string());
            }
            var first = source.takeRequest(2, TimeUnit.SECONDS);
            var redirected = cdn.takeRequest(2, TimeUnit.SECONDS);
            assertNotNull(first);
            assertNotNull(redirected);
            assertEquals("Bearer addon-token", first.getHeader("Authorization"));
            assertNull(redirected.getHeader("Authorization"));
            assertNull(redirected.getHeader("Cookie"));
            assertNull(redirected.getHeader("X-Api-Key"));
            assertEquals("https://addon.test", redirected.getHeader("Referer"));
            assertEquals("Navigator-Test", redirected.getHeader("User-Agent"));
        }
    }
    @Test public void manifestsAndSegmentsOnTheStreamOriginKeepHeaders() throws Exception {
        try (MockWebServer server = new MockWebServer()) {
            server.start();
            server.enqueue(new MockResponse().setBody("manifest"));
            server.enqueue(new MockResponse().setBody("segment"));
            var client = ScopedHttp.forStream(new OkHttpClient(), server.url("/").uri(), Map.of("X-Api-Key", "private-key"));
            for (String path : new String[]{"/playlist.m3u8", "/segment.ts"}) {
                try (var response = client.newCall(new Request.Builder().url(server.url(path)).build()).execute()) { assertEquals(200, response.code()); }
                assertEquals("private-key", server.takeRequest(2, TimeUnit.SECONDS).getHeader("X-Api-Key"));
            }
        }
    }
}
