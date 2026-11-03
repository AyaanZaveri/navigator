package app.navigator.android

import java.io.IOException
import java.net.URI
import okhttp3.OkHttpClient

object ScopedHttp {
    @JvmStatic fun forStream(base: OkHttpClient, origin: URI, headers: Map<String, String>): OkHttpClient {
        val snapshot = headers.toMap()
        return base.newBuilder().addNetworkInterceptor { chain ->
            val request = chain.request()
            val target = request.url.toUri()
            if (origin.scheme.equals("https", true) && target.scheme.equals("http", true))
                throw IOException("Refusing to downgrade an HTTPS stream.")
            val builder = request.newBuilder()
            for ((name, value) in snapshot) {
                val publicHint = name.equals("User-Agent", true) || name.equals("Referer", true) || name.equals("Origin", true)
                if (publicHint || StreamPolicy.sameOrigin(origin, target)) builder.header(name, value)
                else builder.removeHeader(name)
            }
            chain.proceed(builder.build())
        }.build()
    }
}
