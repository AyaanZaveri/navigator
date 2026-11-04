package app.navigator.android

import java.util.function.LongPredicate

object ThumbnailWarmPlan {
    const val INTERVAL_MS = 1000L
    @JvmStatic fun bucket(position: Long) = maxOf(0L, Math.round(position.toDouble() / INTERVAL_MS) * INTERVAL_MS)
    @JvmStatic fun next(position: Long, buffered: Long, duration: Long, cached: LongPredicate): Long? {
        val end = minOf(buffered - INTERVAL_MS, duration - INTERVAL_MS, position + 120_000)
        var at = bucket(position)
        while (at <= end) {
            if (!cached.test(at)) return at
            at += INTERVAL_MS
        }
        return null
    }
    @JvmStatic fun restAfter(work: Long) = maxOf(200, work.coerceAtLeast(0) * 3)
}
