package app.navigator.android

import android.content.Context
import androidx.media3.common.util.UnstableApi
import androidx.media3.database.StandaloneDatabaseProvider
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.ResolvingDataSource
import androidx.media3.datasource.cache.CacheDataSink
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.datasource.cache.LeastRecentlyUsedCacheEvictor
import androidx.media3.datasource.cache.SimpleCache
import java.io.File

@UnstableApi
object StreamByteCache {
    private var shared: SimpleCache? = null
    @Synchronized private fun get(context: Context): SimpleCache = shared ?: SimpleCache(
        File(context.applicationContext.cacheDir, "stream-bytes"),
        LeastRecentlyUsedCacheEvictor(96L * 1024 * 1024),
        StandaloneDatabaseProvider(context.applicationContext)
    ).also { shared = it }

    fun factory(context: Context, upstream: DataSource.Factory, session: String): DataSource.Factory {
        val cached = CacheDataSource.Factory().setCache(get(context))
            .setCacheKeyFactory { spec -> session + ":" + (spec.key ?: spec.uri.toString()) }
            .setUpstreamDataSourceFactory(upstream)
            .setCacheWriteDataSinkFactory(CacheDataSink.Factory().setCache(get(context)).setFragmentSize(512L * 1024))
            .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)
        return ResolvingDataSource.Factory(cached) { spec ->
            spec.buildUpon().setFlags(spec.flags or DataSpec.FLAG_ALLOW_CACHE_FRAGMENTATION).build()
        }
    }
}
