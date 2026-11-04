package app.navigator.android

object GlassTiming {
    const val IDLE_MS = 250L
    @JvmStatic fun delayAfter(workMs: Long): Long {
        val work = workMs.coerceAtLeast(0)
        return maxOf(84, work * 4) - work
    }
}
