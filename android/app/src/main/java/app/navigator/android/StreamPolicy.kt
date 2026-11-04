package app.navigator.android

import java.net.URI

object StreamPolicy {
    @JvmStatic fun webOrigin(value: String?): URI {
        val uri = streamUrl(value)
        require(uri.scheme.equals("https", true) && uri.rawQuery == null && uri.rawFragment == null &&
            (uri.path.isNullOrEmpty() || uri.path == "/")) { "Enter an HTTPS server address without a path, query, or fragment." }
        return uri
    }
    @JvmStatic fun streamUrl(value: String?): URI {
        require(value != null && value.length <= 32768 && value.none { it.code <= 32 || it.code == 127 }) { "Invalid stream URL." }
        val uri = try { URI(value) } catch (_: Exception) { throw IllegalArgumentException("Invalid stream URL.") }
        require((uri.scheme.equals("https", true) || uri.scheme.equals("http", true)) &&
            uri.host != null && uri.rawUserInfo == null && uri.port <= 65535) { "Choose an HTTP or HTTPS stream without embedded credentials." }
        return uri
    }
    @JvmStatic fun headers(values: Map<String, String?>): MutableMap<String, String> {
        require(values.size <= 64) { "Too many stream headers." }
        val result = linkedMapOf<String, String>()
        for ((name, value) in values) {
            require(name.matches(Regex("[!#${'$'}%&'*+.^_`|~0-9A-Za-z-]{1,128}")) && value != null &&
                value.length <= 8192 && value.none { it.code < 32 || it.code == 127 } &&
                !name.equals("Host", true) && !name.equals("Connection", true) && !name.equals("Content-Length", true)) { "Invalid stream request header." }
            result[name] = value
        }
        return result
    }
    @JvmStatic fun sameOrigin(a: URI, b: URI): Boolean = a.scheme.equals(b.scheme, true) && a.host != null &&
        a.host.equals(b.host, true) && port(a) == port(b)
    private fun port(uri: URI) = if (uri.port >= 0) uri.port else if (uri.scheme.equals("https", true)) 443 else 80
}
