package app.navigator.android;

import android.content.Context;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.database.StandaloneDatabaseProvider;
import androidx.media3.datasource.DataSource;
import androidx.media3.datasource.DataSpec;
import androidx.media3.datasource.ResolvingDataSource;
import androidx.media3.datasource.cache.CacheDataSink;
import androidx.media3.datasource.cache.CacheDataSource;
import androidx.media3.datasource.cache.LeastRecentlyUsedCacheEvictor;
import androidx.media3.datasource.cache.SimpleCache;
import java.io.File;

/** Playback and the independent preview decoder reuse downloaded byte ranges.
 * One process-wide owner avoids SimpleCache directory locks. Session keys keep
 * cached responses isolated when addon credentials or source URLs change. */
@UnstableApi
final class StreamByteCache {
    private static SimpleCache shared;
    private static synchronized SimpleCache get(Context context) {
        if (shared == null) shared = new SimpleCache(
            new File(context.getApplicationContext().getCacheDir(), "stream-bytes"),
            new LeastRecentlyUsedCacheEvictor(96L * 1024 * 1024),
            new StandaloneDatabaseProvider(context.getApplicationContext()));
        return shared;
    }

    static DataSource.Factory factory(Context context, DataSource.Factory upstream, String session) {
        var cache = get(context);
        var cached = new CacheDataSource.Factory()
            .setCache(cache)
            .setCacheKeyFactory(spec -> session + ":" + (spec.key != null ? spec.key : spec.uri.toString()))
            .setUpstreamDataSourceFactory(upstream)
            .setCacheWriteDataSinkFactory(new CacheDataSink.Factory().setCache(cache).setFragmentSize(512 * 1024))
            // Never block playback behind a thumbnail writing the same hole.
            .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR);
        return new ResolvingDataSource.Factory(cached, spec -> spec.buildUpon()
            .setFlags(spec.flags | DataSpec.FLAG_ALLOW_CACHE_FRAGMENTATION).build());
    }
}
