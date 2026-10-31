package app.navigator.android;

import java.net.URI;
import java.util.LinkedHashMap;
import java.util.Map;

final class StreamPolicy {
    static URI webOrigin(String value) {
        URI url = streamUrl(value);
        if (!url.getScheme().equalsIgnoreCase("https") || url.getRawQuery() != null || url.getRawFragment() != null
                || !(url.getPath().isEmpty() || url.getPath().equals("/"))) {
            throw new IllegalArgumentException("Enter an HTTPS server address without a path, query, or fragment.");
        }
        return url;
    }

    static URI streamUrl(String value) {
        if (value == null || value.length() > 32768 || value.chars().anyMatch(c -> c <= 32 || c == 127)) throw new IllegalArgumentException("Invalid stream URL.");
        URI url;
        try { url = new URI(value); } catch (Exception invalid) { throw new IllegalArgumentException("Invalid stream URL."); }
        String scheme = url.getScheme();
        if (scheme == null || !(scheme.equalsIgnoreCase("https") || scheme.equalsIgnoreCase("http")) || url.getHost() == null || url.getRawUserInfo() != null || url.getPort() > 65535) {
            throw new IllegalArgumentException("Choose an HTTP or HTTPS stream without embedded credentials.");
        }
        return url;
    }

    static Map<String, String> headers(Map<String, String> source) {
        if (source.size() > 64) throw new IllegalArgumentException("Too many stream headers.");
        Map<String, String> result = new LinkedHashMap<>();
        for (Map.Entry<String, String> entry : source.entrySet()) {
            String key = entry.getKey(), value = entry.getValue();
            if (!key.matches("[!#$%&'*+.^_`|~0-9A-Za-z-]{1,128}") || value == null || value.length() > 8192
                    || value.chars().anyMatch(c -> c < 32 || c == 127)
                    || key.equalsIgnoreCase("Host") || key.equalsIgnoreCase("Connection") || key.equalsIgnoreCase("Content-Length")) {
                throw new IllegalArgumentException("Invalid stream request header.");
            }
            result.put(key, value);
        }
        return result;
    }

    static boolean sameOrigin(URI a, URI b) {
        return a.getScheme().equalsIgnoreCase(b.getScheme()) && a.getHost() != null && a.getHost().equalsIgnoreCase(b.getHost()) && port(a) == port(b);
    }
    private static int port(URI uri) { return uri.getPort() >= 0 ? uri.getPort() : uri.getScheme().equalsIgnoreCase("https") ? 443 : 80; }
}
