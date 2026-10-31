package app.navigator.android;

import java.io.IOException;
import java.net.URI;
import java.util.Map;
import okhttp3.OkHttpClient;
import okhttp3.Request;

final class ScopedHttp {
    static OkHttpClient forStream(OkHttpClient base, URI origin, Map<String, String> headers) {
        return base.newBuilder().addNetworkInterceptor(chain -> {
            URI target = chain.request().url().uri();
            if (origin.getScheme().equalsIgnoreCase("https") && target.getScheme().equalsIgnoreCase("http")) throw new IOException("Refusing to downgrade an HTTPS stream.");
            Request.Builder request = chain.request().newBuilder();
            for (Map.Entry<String, String> header : headers.entrySet()) {
                String name = header.getKey();
                // Addon authentication stays on the stream origin; public request hints can follow CDN segments.
                boolean publicHint = name.equalsIgnoreCase("User-Agent") || name.equalsIgnoreCase("Referer") || name.equalsIgnoreCase("Origin");
                if (publicHint || StreamPolicy.sameOrigin(origin, target)) request.header(name, header.getValue());
                else request.removeHeader(name);
            }
            return chain.proceed(request.build());
        }).build();
    }
}
