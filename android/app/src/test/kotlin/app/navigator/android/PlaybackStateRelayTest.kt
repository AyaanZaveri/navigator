package app.navigator.android

import org.junit.Assert.assertEquals
import org.junit.Test

class PlaybackStateRelayTest {
    private fun paused() = PlaybackSnapshot("session-a", 30_000, 1_200_000, true, 1f, false, 1f, false, false, 90_000, 1920, 1080)

    @Test fun fullyBufferedPauseDoesNotSendTheSameStateFourTimesPerSecond() {
        val received = mutableListOf<PlaybackSnapshot>()
        val relay = PlaybackStateRelay(received::add)
        repeat(240) { relay.update(paused()) } // One minute of 250ms polls + equivalent event snapshots.
        assertEquals(listOf(paused()), received)
    }

    @Test fun changedProgressAndPlaybackCommandsAreDeliveredImmediately() {
        val received = mutableListOf<PlaybackSnapshot>()
        val relay = PlaybackStateRelay(received::add)
        val initial = paused()
        val sequence = listOf(initial, initial.copy(paused = false), initial.copy(positionMs = 30_250, paused = false),
            initial.copy(positionMs = 30_500, paused = false), initial.copy(positionMs = 180_000, seeking = true),
            initial.copy(positionMs = 180_000, seeking = false))
        sequence.forEach { relay.update(it); relay.update(it) } // Timer and callback can coincide.
        assertEquals(sequence, received)
    }

    @Test fun bufferTracksVolumeSpeedAndGeometryChangesCannotBeLost() {
        val initial = paused()
        val changes = listOf(initial.copy(durationMs = 1_201_000), initial.copy(volume = .5f), initial.copy(muted = true),
            initial.copy(rate = 1.5f), initial.copy(buffering = true), initial.copy(bufferedMs = 90_250),
            initial.copy(width = 3840), initial.copy(height = 2160))
        for (change in changes) {
            val received = mutableListOf<PlaybackSnapshot>()
            val relay = PlaybackStateRelay(received::add)
            relay.update(initial); relay.update(change)
            assertEquals(listOf(initial, change), received)
        }
    }

    @Test fun replacementSessionAndRecreatedPlayerReceiveAnInitialSnapshot() {
        val received = mutableListOf<PlaybackSnapshot>()
        val relay = PlaybackStateRelay(received::add)
        val initial = paused()
        relay.update(initial)
        relay.update(initial.copy(session = "session-b"))
        relay.reset()
        relay.update(initial.copy(session = "session-b"))
        assertEquals(3, received.size)
    }

    @Test fun bridgeReconnectCanResynchronizeUnchangedPausedPlayback() {
        val received = mutableListOf<PlaybackSnapshot>()
        val relay = PlaybackStateRelay(received::add)
        val initial = paused()
        relay.update(initial)
        relay.update(initial, force = true) // Document-start hello after reconnect.
        relay.update(initial)
        assertEquals(listOf(initial, initial), received)
    }
}
