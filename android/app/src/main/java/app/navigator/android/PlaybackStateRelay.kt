package app.navigator.android

/** The complete wire-visible state, before allocating JSON or crossing WebView IPC. */
data class PlaybackSnapshot(
    val session: String,
    val positionMs: Long,
    val durationMs: Long,
    val paused: Boolean,
    val volume: Float,
    val muted: Boolean,
    val rate: Float,
    val buffering: Boolean,
    val seeking: Boolean,
    val bufferedMs: Long,
    val width: Int,
    val height: Int
)

/** Event callbacks and the progress timer may observe identical state. Keep all
 * changes immediate, suppress repeats, and allow a new document to resynchronize. */
class PlaybackStateRelay(private val publish: (PlaybackSnapshot) -> Unit) {
    private var previous: PlaybackSnapshot? = null

    fun update(snapshot: PlaybackSnapshot, force: Boolean = false) {
        if (!force && snapshot == previous) return
        previous = snapshot
        publish(snapshot)
    }

    fun reset() { previous = null }
}
