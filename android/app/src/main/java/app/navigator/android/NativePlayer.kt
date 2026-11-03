package app.navigator.android

import android.content.Context
import android.net.Uri
import android.view.Gravity
import android.view.SurfaceView
import android.view.View
import android.widget.FrameLayout
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.TrackSelectionOverride
import androidx.media3.common.Tracks
import androidx.media3.common.VideoSize
import androidx.media3.common.text.CueGroup
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.SubtitleView
import okhttp3.OkHttpClient
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject
import java.net.URI
import java.util.concurrent.TimeUnit

/** Shared HTML-media bridge, with video retained in Android's HDR surface. */
@UnstableApi
class NativePlayer(private val context: Context, parent: FrameLayout, private val emit: (JSONObject) -> Unit) {
    private val layer = FrameLayout(context).apply { visibility = View.GONE }
    private val surface = SurfaceView(context)
    private val videoFrame = AspectRatioFrameLayout(context)
    private val bitmapSubtitles = SubtitleView(context)
    private val glass: GlassBackdrop
    private var resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
    private val http = OkHttpClient.Builder().connectTimeout(15, TimeUnit.SECONDS).readTimeout(30, TimeUnit.SECONDS).build()
    private var player: ExoPlayer? = null
    private var previews: SeekPreviews? = null
    private var thumbnailRequest: Long? = null
    private var thumbnailPosition: Long? = null
    private var scrubbing = false
    private var scrubWasPlaying = false
    private var selector: DefaultTrackSelector? = null
    private var session = ""
    private var url = ""
    private var headers = linkedMapOf<String, String>()
    private val choices = mutableMapOf<Int, TrackChoice>()
    private var audioChoice: String? = null
    private var subtitleChoice = "no"
    private var position = 0L
    private var play = true
    private var foreground = false
    private var loaded = false
    private var metadataPublishedForSession = false
    private var ready = false
    private var seeking = false
    private var volume = 1f
    private var muted = false
    private var rate = 1f
    private var aspect = 16.0 / 9
    private var subtitle = ""
    private val states = PlaybackStateRelay { state ->
        emit(json("type", "state", "session", state.session, "state", json(
            "position", state.positionMs / 1000.0, "duration", state.durationMs / 1000.0,
            "paused", state.paused, "volume", state.volume, "muted", state.muted, "rate", state.rate,
            "buffering", state.buffering, "seeking", state.seeking, "buffered", state.bufferedMs / 1000.0,
            "width", state.width, "height", state.height)))
    }
    private data class TrackChoice(val group: Tracks.Group, val index: Int, val type: Int)

    init {
        videoFrame.addView(surface, FrameLayout.LayoutParams(-1, -1))
        layer.addView(videoFrame, FrameLayout.LayoutParams(-1, -1, Gravity.CENTER))
        videoFrame.addView(bitmapSubtitles, FrameLayout.LayoutParams(-1, -1))
        parent.addView(layer, FrameLayout.LayoutParams(-1, -1, Gravity.CENTER))
        glass = GlassBackdrop(surface, parent, ::positionMs) { src ->
            if (foreground && active()) emit(json("type", "glass-frame", "session", session, "src", src))
        }
        parent.addOnLayoutChangeListener { _, _, _, _, _, _, _, _, _ -> fit(parent) }
    }
    fun durationMs() = player?.duration?.coerceAtLeast(0) ?: 0L
    fun bufferedMs() = player?.bufferedPosition?.coerceAtLeast(0) ?: 0L
    fun positionMs() = player?.currentPosition?.coerceAtLeast(0) ?: 0L
    fun canScrub() = readyForGestures() && player?.isCurrentMediaItemSeekable == true && durationMs() > 0
    fun beginScrub(owner: String): Boolean {
        val current = player ?: return false
        if (session != owner || !canScrub() || scrubbing) return false
        scrubWasPlaying = current.playWhenReady; scrubbing = true; current.pause()
        previews?.warm(0, 0, 0, false)
        return true
    }
    fun endScrub(owner: String, commit: Boolean, target: Long) {
        val current = player ?: return
        if (session != owner || !scrubbing) return
        if (commit) { seeking = true; current.seekTo(target.coerceIn(0, durationMs())) }
        val resume = scrubWasPlaying; scrubbing = false; current.playWhenReady = resume; state()
    }
    private fun dataSourceFactory(): DefaultDataSource.Factory {
        val upstream = OkHttpDataSource.Factory(ScopedHttp.forStream(http, URI.create(url), headers))
            .setUserAgent("NavigatorAndroid/0.1")
        return DefaultDataSource.Factory(context, StreamByteCache.factory(context, upstream, session))
    }
    private fun preparePreviews() {
        if (previews != null || !canScrub()) return
        val data = dataSourceFactory()
        val owner = session
        previews = SeekPreviews(context, MediaItem.fromUri(Uri.parse(url)), DefaultMediaSourceFactory(data)) { at, src ->
            if (owner == session && foreground) {
                // A requested frame resolves the promise; intermediate frames stream.
                // Sending both duplicates the full JPEG.
                if (thumbnailRequest != null && thumbnailPosition == at) emit(json("type", "thumbnail", "session", session,
                    "request", thumbnailRequest, "src", src ?: JSONObject.NULL, "position", at / 1000.0))
                else if (src != null) emit(json("type", "thumbnail-frame", "session", session, "position", at / 1000.0, "src", src))
            }
        }
    }
    fun warmPreview() { preparePreviews(); previews?.request(positionMs()) }
    fun warmPreviews() {
        if (!foreground || !canScrub()) return
        preparePreviews()
        previews?.warm(positionMs(), bufferedMs(), durationMs(), !scrubbing && player?.playbackState == Player.STATE_READY)
    }
    private fun thumbnail(message: JSONObject) {
        thumbnailRequest = null; thumbnailPosition = null
        if (message.isNull("position")) { previews?.cancel(); return }
        val at = message.optDouble("position", Double.NaN)
        if (!at.isFinite() || at < 0) return
        thumbnailRequest = message.optLong("request")
        val target = SeekPreviews.bucket(minOf(at * 1000, durationMs().toDouble()).toLong())
        thumbnailPosition = target
        preparePreviews()
        val current = previews
        if (current != null) current.request(target)
        else emit(json("type", "thumbnail", "session", session, "request", thumbnailRequest,
            "src", JSONObject.NULL, "position", JSONObject.NULL))
    }
    fun readyForGestures() = active() && ready
    fun active() = session.isNotEmpty()
    fun session() = session

    fun command(message: JSONObject) {
        val type = message.optString("type")
        if (type == "load") {
            val nextSession = message.optString("session")
            if (!nextSession.matches(Regex("[A-Za-z0-9_-]{1,128}"))) return
            try {
                val nextUrl = message.optString("url", "")
                StreamPolicy.streamUrl(nextUrl)
                val nextHeaders = linkedMapOf<String, String?>()
                val rawHeaders = message.optJSONObject("headers")
                require(!message.has("headers") || message.isNull("headers") || rawHeaders != null) { "Invalid stream request headers." }
                rawHeaders?.keys()?.forEach { key ->
                    val value = rawHeaders.get(key)
                    require(value is String) { "Invalid stream request header." }
                    nextHeaders[key] = value
                }
                val checkedHeaders = StreamPolicy.headers(nextHeaders)
                release()
                session = nextSession; url = nextUrl; headers = LinkedHashMap(checkedHeaders)
                val start = message.optDouble("startPosition", 0.0)
                position = if (start.isFinite()) (start * 1000).coerceIn(0.0, Long.MAX_VALUE.toDouble()).toLong() else 0
                resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
                play = true; metadataPublishedForSession = false; audioChoice = null; subtitleChoice = "no"
                layer.visibility = View.VISIBLE
                if (foreground) create()
            } catch (failure: IllegalArgumentException) {
                emit(json("type", "error", "session", nextSession, "message", failure.message))
            }
            return
        }
        if (!active() || session != message.optString("session")) return
        when (type) {
            "glass" -> glass.setActive(message.optBoolean("active"))
            "video-fit" -> {
                resizeMode = when (message.optString("mode")) {
                    "fit" -> AspectRatioFrameLayout.RESIZE_MODE_FIT
                    "crop" -> AspectRatioFrameLayout.RESIZE_MODE_ZOOM
                    "stretch" -> AspectRatioFrameLayout.RESIZE_MODE_FILL
                    else -> resizeMode
                }
                fit(layer.parent as FrameLayout)
            }
            "play" -> { play = true; if (scrubbing) scrubWasPlaying = true else player?.play() }
            "pause" -> { play = false; if (scrubbing) scrubWasPlaying = false else player?.pause() }
            "stop" -> stop()
            "seek" -> {
                val at = message.optDouble("position", -1.0)
                val current = player
                if (!at.isFinite() || at < 0 || current == null) return
                val duration = current.duration
                var wanted = minOf(at * 1000, Long.MAX_VALUE.toDouble()).toLong()
                if (duration > 0) wanted = minOf(wanted, duration)
                seeking = true; state(); current.seekTo(wanted)
            }
            "volume" -> {
                val value = message.optDouble("volume", Double.NaN)
                if (!value.isFinite()) return
                volume = value.coerceIn(0.0, 1.0).toFloat(); applyVolume()
            }
            "muted" -> { muted = message.optBoolean("muted"); applyVolume() }
            "rate" -> {
                val value = message.optDouble("rate", Double.NaN)
                if (!value.isFinite()) return
                rate = value.coerceIn(.25, 4.0).toFloat(); player?.setPlaybackSpeed(rate)
            }
            "track" -> {
                val kind = message.optString("kind"); val id = message.optString("id")
                when (kind) { "audio" -> audioChoice = id; "subtitle" -> subtitleChoice = id; else -> return }
                select(if (kind == "audio") C.TRACK_TYPE_AUDIO else C.TRACK_TYPE_TEXT, id)
            }
            "thumbnail" -> thumbnail(message)
            else -> return
        }
        state()
    }
    private fun create() {
        if (!active() || player != null) return
        loaded = false; ready = false; seeking = false; clearCues()
        val trackSelector = DefaultTrackSelector(context)
        selector = trackSelector
        trackSelector.setParameters(trackSelector.buildUponParameters().setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true))
        val owner = ExoPlayer.Builder(context).setTrackSelector(trackSelector)
            .setMediaSourceFactory(DefaultMediaSourceFactory(dataSourceFactory())).build()
        player = owner
        owner.setAudioAttributes(AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MOVIE).build(), true)
        owner.setHandleAudioBecomingNoisy(true)
        owner.setVideoSurfaceView(surface); applyVolume(); owner.setPlaybackSpeed(rate)
        owner.addListener(object : Player.Listener {
            private fun current() = player === owner
            override fun onEvents(ignored: Player, events: Player.Events) {
                if (!current()) return
                if (!loaded && owner.playbackState == Player.STATE_READY) markLoaded()
                if (loaded && !ready && owner.currentTracks.groups.none { it.type == C.TRACK_TYPE_VIDEO && it.isSelected }) markReady()
                layer.keepScreenOn = owner.playWhenReady && owner.playbackState != Player.STATE_ENDED && owner.playerError == null
                state()
            }
            override fun onRenderedFirstFrame() { if (current()) markReady() }
            override fun onPlaybackStateChanged(value: Int) {
                if (current() && value == Player.STATE_ENDED) { clearCues(); send("ended") }
            }
            override fun onPositionDiscontinuity(old: Player.PositionInfo, next: Player.PositionInfo, reason: Int) {
                if (current()) { seeking = false; clearCues(); state() }
            }
            override fun onVideoSizeChanged(size: VideoSize) {
                if (!current() || size.height <= 0) return
                aspect = size.width.toDouble() * size.pixelWidthHeightRatio / size.height
                fit(layer.parent as FrameLayout); state()
            }
            override fun onTracksChanged(tracks: Tracks) { if (current()) updateTracks(tracks) }
            override fun onCues(group: CueGroup) {
                if (!current()) return
                bitmapSubtitles.setCues(group.cues.filter { it.bitmap != null })
                publishSubtitle(group.cues.mapNotNull { it.text?.toString() }.joinToString("\n"))
            }
            override fun onPlayerError(failure: PlaybackException) {
                if (!current()) return
                layer.keepScreenOn = false; clearCues()
                emit(json("type", "error", "session", session, "message",
                    "Android playback failed (${failure.errorCodeName}). Try another stream or retry."))
            }
        })
        send("loading")
        owner.setMediaItem(MediaItem.fromUri(Uri.parse(url)), position)
        owner.prepare(); owner.playWhenReady = play; state()
    }
    private fun markReady() {
        markLoaded()
        if (!ready) { ready = true; state(); send("ready") }
    }
    private fun markLoaded() {
        if (loaded) return
        loaded = true; state()
        // Background codec recreation must not reapply the original seek/autoplay.
        if (!metadataPublishedForSession) { metadataPublishedForSession = true; send("loaded") }
    }
    private fun updateTracks(tracks: Tracks) {
        choices.clear()
        val result = JSONArray()
        for ((groupIndex, group) in tracks.groups.withIndex()) {
            val type = group.type
            for (index in 0 until group.length) {
                if ((type != C.TRACK_TYPE_AUDIO && type != C.TRACK_TYPE_TEXT) || !group.isTrackSupported(index)) continue
                val id = groupIndex * 10000 + index + 1
                choices[id] = TrackChoice(group, index, type)
                val format = group.getTrackFormat(index)
                var title = format.label?.takeUnless { it.isBlank() } ?: format.language ?: "Track ${index + 1}"
                if (type == C.TRACK_TYPE_AUDIO && format.channelCount > 0) title += " · ${format.channelCount}ch"
                result.put(json("id", id, "type", if (type == C.TRACK_TYPE_AUDIO) "audio" else "sub", "title", title,
                    "lang", format.language ?: "und", "selected", group.isTrackSelected(index)))
            }
        }
        emit(json("type", "tracks", "session", session, "tracks", result))
        audioChoice?.let { select(C.TRACK_TYPE_AUDIO, it) }
        select(C.TRACK_TYPE_TEXT, subtitleChoice)
    }
    private fun select(type: Int, id: String) {
        val current = selector ?: return
        val builder = current.buildUponParameters().clearOverridesOfType(type)
        if (type == C.TRACK_TYPE_TEXT && id == "no") {
            builder.setTrackTypeDisabled(type, true); clearCues()
        } else {
            val choice = choices[id.toIntOrNull()] ?: return
            if (choice.type != type) return
            builder.setTrackTypeDisabled(type, false).addOverride(TrackSelectionOverride(choice.group.mediaTrackGroup, choice.index))
        }
        val params = builder.build()
        if (params != current.parameters) current.parameters = params
    }
    fun state(force: Boolean = false) {
        val current = player ?: return
        if (!active()) return
        val size = current.videoSize
        states.update(PlaybackSnapshot(session,
            current.currentPosition.coerceAtLeast(0), current.duration.coerceAtLeast(0),
            !(if (scrubbing) scrubWasPlaying else current.playWhenReady), volume, muted, rate,
            current.playbackState == Player.STATE_BUFFERING, seeking,
            current.bufferedPosition.coerceAtLeast(0), size.width, size.height), force)
    }
    fun start() { foreground = true; create() }
    fun suspend() {
        foreground = false
        player?.let { position = it.currentPosition.coerceAtLeast(0); play = if (scrubbing) scrubWasPlaying else it.playWhenReady }
        release()
    }
    fun stop() {
        release(); session = ""; url = ""; headers.clear(); position = 0; layer.visibility = View.GONE
    }
    fun destroy() { stop(); glass.close(); http.dispatcher.cancelAll(); http.connectionPool.evictAll() }
    private fun release() {
        states.reset()
        glass.setActive(false)
        scrubbing = false; thumbnailRequest = null; thumbnailPosition = null
        previews?.close(); previews = null
        val previous = player
        player = null; selector = null; previous?.release()
        layer.keepScreenOn = false; clearCues(); choices.clear()
    }
    private fun applyVolume() { player?.volume = if (muted) 0f else volume }
    private fun clearCues() { bitmapSubtitles.setCues(emptyList()); publishSubtitle("") }
    private fun publishSubtitle(text: String) {
        if (text == subtitle) return
        subtitle = text
        if (active()) emit(json("type", "subtitle", "session", session, "text", text))
    }
    private fun send(type: String) = emit(json("type", type, "session", session))
    private fun fit(parent: FrameLayout) {
        val width = parent.width - parent.paddingLeft - parent.paddingRight
        val height = parent.height - parent.paddingTop - parent.paddingBottom
        if (width <= 0 || height <= 0) return
        if (layer.layoutParams.width != width || layer.layoutParams.height != height)
            layer.layoutParams = FrameLayout.LayoutParams(width, height, Gravity.CENTER)
        videoFrame.setAspectRatio(aspect.toFloat()); videoFrame.resizeMode = resizeMode
    }
    companion object {
        fun json(vararg values: Any?): JSONObject {
            val result = JSONObject()
            try { for (i in values.indices step 2) result.put(values[i] as String, values[i + 1]) }
            catch (impossible: JSONException) { throw IllegalArgumentException(impossible) }
            return result
        }
    }
}
