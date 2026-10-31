package app.navigator.android;

import android.content.Context;
import android.graphics.Bitmap;
import android.net.Uri;
import android.view.Gravity;
import android.view.SurfaceView;
import android.view.View;
import android.widget.FrameLayout;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.Format;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.TrackSelectionOverride;
import androidx.media3.common.Tracks;
import androidx.media3.common.VideoSize;
import androidx.media3.common.text.Cue;
import androidx.media3.common.text.CueGroup;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.datasource.DefaultDataSource;
import androidx.media3.datasource.okhttp.OkHttpDataSource;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector;
import androidx.media3.ui.SubtitleView;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.net.URI;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;
import okhttp3.OkHttpClient;

/** Implements the shared HTML-media bridge, with video retained in Android's HDR surface. */
@UnstableApi
final class NativePlayer {
    private final Context context;
    private final FrameLayout layer;
    private final SurfaceView surface;
    private final SubtitleView bitmapSubtitles;
    private final Consumer<JSONObject> emit;
    private final OkHttpClient http = new OkHttpClient.Builder().connectTimeout(15, TimeUnit.SECONDS).readTimeout(30, TimeUnit.SECONDS).build();
    private ExoPlayer player;
    private SeekPreviews previews;
    private boolean scrubbing;
    private boolean scrubWasPlaying;
    private DefaultTrackSelector selector;
    private String session = "";
    private String url = "";
    private Map<String, String> headers = new LinkedHashMap<>();
    private final Map<Integer, TrackChoice> choices = new HashMap<>();
    private String audioChoice;
    private String subtitleChoice = "no";
    private long position;
    private boolean play = true;
    private boolean foreground;
    private boolean loaded;
    private boolean metadataPublishedForSession;
    private boolean ready;
    private boolean seeking;
    private float volume = 1;
    private boolean muted;
    private float rate = 1;
    private double aspect = 16.0 / 9;
    private String subtitle = "";

    private record TrackChoice(Tracks.Group group, int index, int type) {}

    NativePlayer(Context context, FrameLayout parent, Consumer<JSONObject> emit) {
        this.context = context;
        this.emit = emit;
        layer = new FrameLayout(context);
        layer.setVisibility(View.GONE);
        surface = new SurfaceView(context);
        bitmapSubtitles = new SubtitleView(context);
        layer.addView(surface, new FrameLayout.LayoutParams(-1, -1));
        layer.addView(bitmapSubtitles, new FrameLayout.LayoutParams(-1, -1));
        parent.addView(layer, new FrameLayout.LayoutParams(-1, -1, Gravity.CENTER));
        parent.addOnLayoutChangeListener((v, l, t, r, b, ol, ot, or, ob) -> fit(parent));
    }

    long durationMs() { return player == null ? 0 : Math.max(0,player.getDuration()); }
    long positionMs() { return player == null ? 0 : Math.max(0,player.getCurrentPosition()); }
    boolean canScrub() { return readyForGestures() && player != null && player.isCurrentMediaItemSeekable() && durationMs()>0; }
    boolean beginScrub(String owner) {
        if (!session.equals(owner) || !canScrub() || scrubbing) return false;
        scrubWasPlaying=player.getPlayWhenReady(); scrubbing=true; player.pause(); return true;
    }
    void endScrub(String owner,boolean commit,long target) {
        if (!session.equals(owner) || !scrubbing || player == null) return;
        if (commit) { seeking=true; player.seekTo(Math.max(0,Math.min(durationMs(),target))); }
        boolean resume=scrubWasPlaying; scrubbing=false; player.setPlayWhenReady(resume); state();
    }
    void preview(String owner,long at,Consumer<Bitmap> callback) {
        if (!session.equals(owner) || !foreground || !canScrub()) return;
        if (previews == null) {
            var data=new DefaultDataSource.Factory(context,
                new OkHttpDataSource.Factory(ScopedHttp.forStream(http,URI.create(url),headers)).setUserAgent("NavigatorAndroid/0.1"));
            previews=new SeekPreviews(context,MediaItem.fromUri(Uri.parse(url)),new DefaultMediaSourceFactory(data));
        }
        previews.request(at,callback);
    }
    void warmPreview() { if (canScrub()) preview(session,positionMs(),ignored -> {}); }

    boolean readyForGestures() { return active() && ready; }
    boolean active() { return !session.isEmpty(); }
    String session() { return session; }

    void command(JSONObject message) throws JSONException {
        String type = message.optString("type");
        if (type.equals("load")) {
            String nextSession = message.optString("session");
            if (!nextSession.matches("[A-Za-z0-9_-]{1,128}")) return;
            try {
                String nextUrl = message.optString("url", "");
                StreamPolicy.streamUrl(nextUrl);
                Map<String, String> nextHeaders = new LinkedHashMap<>();
                JSONObject rawHeaders = message.optJSONObject("headers");
                if (message.has("headers") && !message.isNull("headers") && rawHeaders == null) throw new IllegalArgumentException("Invalid stream request headers.");
                if (rawHeaders != null) {
                    for (var keys = rawHeaders.keys(); keys.hasNext();) {
                        String key = keys.next();
                        Object value = rawHeaders.get(key);
                        if (!(value instanceof String)) throw new IllegalArgumentException("Invalid stream request header.");
                        nextHeaders.put(key, (String) value);
                    }
                }
                nextHeaders = StreamPolicy.headers(nextHeaders);
                release();
                session = nextSession;
                url = nextUrl;
                headers = nextHeaders;
                position = 0;
                play = true;
                metadataPublishedForSession = false;
                audioChoice = null;
                subtitleChoice = "no";
                layer.setVisibility(View.VISIBLE);
                if (foreground) create();
            } catch (IllegalArgumentException failure) {
                emit.accept(object("type", "error", "session", nextSession, "message", failure.getMessage()));
            }
            return;
        }
        if (!active() || !session.equals(message.optString("session"))) return;
        switch (type) {
            case "play": play = true; if (scrubbing) scrubWasPlaying=true; else if (player != null) player.play(); break;
            case "pause": play = false; if (scrubbing) scrubWasPlaying=false; else if (player != null) player.pause(); break;
            case "stop": stop(); break;
            case "seek": {
                double at = message.optDouble("position", -1);
                if (!Double.isFinite(at) || at < 0 || player == null) return;
                long duration = player.getDuration();
                long wanted = (long) Math.min(at * 1000, Long.MAX_VALUE);
                if (duration > 0) wanted = Math.min(wanted, duration);
                seeking = true;
                state();
                player.seekTo(wanted);
                break;
            }
            case "volume": {
                double value = message.optDouble("volume", Double.NaN);
                if (!Double.isFinite(value)) return;
                volume = (float) Math.max(0, Math.min(1, value));
                applyVolume();
                break;
            }
            case "muted": muted = message.optBoolean("muted"); applyVolume(); break;
            case "rate": {
                double value = message.optDouble("rate", Double.NaN);
                if (!Double.isFinite(value)) return;
                rate = (float) Math.max(.25, Math.min(4, value));
                if (player != null) player.setPlaybackSpeed(rate);
                break;
            }
            case "track": {
                String kind = message.optString("kind"), id = message.optString("id");
                if (kind.equals("audio")) audioChoice = id;
                else if (kind.equals("subtitle")) subtitleChoice = id;
                else return;
                select(kind.equals("audio") ? C.TRACK_TYPE_AUDIO : C.TRACK_TYPE_TEXT, id);
                break;
            }
            case "thumbnail":
                // Browser fallback can supply supported previews without seeking the native player.
                if (!message.isNull("position")) emit.accept(object("type", "thumbnail", "session", session,
                    "request", message.optLong("request"), "src", JSONObject.NULL, "position", JSONObject.NULL));
                break;
            default: return;
        }
        state();
    }

    private void create() {
        if (!active() || player != null) return;
        loaded = ready = seeking = false;
        clearCues();
        selector = new DefaultTrackSelector(context);
        selector.setParameters(selector.buildUponParameters().setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true));
        var data = new DefaultDataSource.Factory(context,
            new OkHttpDataSource.Factory(ScopedHttp.forStream(http, URI.create(url), headers)).setUserAgent("NavigatorAndroid/0.1"));
        final ExoPlayer owner = new ExoPlayer.Builder(context).setTrackSelector(selector)
            .setMediaSourceFactory(new DefaultMediaSourceFactory(data)).build();
        player = owner;
        owner.setAudioAttributes(new AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MOVIE).build(), true);
        owner.setHandleAudioBecomingNoisy(true);
        owner.setVideoSurfaceView(surface);
        applyVolume();
        owner.setPlaybackSpeed(rate);
        owner.addListener(new Player.Listener() {
            private boolean current() { return player == owner; }
            @Override public void onEvents(Player ignored, Player.Events events) {
                if (!current()) return;
                if (!loaded && owner.getPlaybackState() == Player.STATE_READY) {
                    markLoaded();
                }
                boolean video = owner.getCurrentTracks().getGroups().stream().anyMatch(g -> g.getType() == C.TRACK_TYPE_VIDEO && g.isSelected());
                if (loaded && !ready && !video) markReady();
                layer.setKeepScreenOn(owner.getPlayWhenReady() && owner.getPlaybackState() != Player.STATE_ENDED && owner.getPlayerError() == null);
                state();
            }
            @Override public void onRenderedFirstFrame() { if (current()) markReady(); }
            @Override public void onPlaybackStateChanged(int value) {
                if (!current()) return;
                if (value == Player.STATE_ENDED) { clearCues(); send("ended"); }
            }
            @Override public void onPositionDiscontinuity(Player.PositionInfo old, Player.PositionInfo next, int reason) {
                if (current()) { seeking = false; clearCues(); state(); }
            }
            @Override public void onVideoSizeChanged(VideoSize size) {
                if (!current() || size.height <= 0) return;
                aspect = (double) size.width * size.pixelWidthHeightRatio / size.height;
                fit((FrameLayout) layer.getParent());
                state();
            }
            @Override public void onTracksChanged(Tracks tracks) { if (current()) updateTracks(tracks); }
            @Override public void onCues(CueGroup group) {
                if (!current()) return;
                List<Cue> bitmaps = new ArrayList<>();
                List<String> text = new ArrayList<>();
                for (Cue cue : group.cues) {
                    if (cue.bitmap != null) bitmaps.add(cue);
                    if (cue.text != null) text.add(cue.text.toString());
                }
                bitmapSubtitles.setCues(bitmaps);
                publishSubtitle(String.join("\n", text));
            }
            @Override public void onPlayerError(PlaybackException failure) {
                if (!current()) return;
                layer.setKeepScreenOn(false);
                clearCues();
                emit.accept(object("type", "error", "session", session, "message",
                    "Android playback failed (" + failure.getErrorCodeName() + "). Try another stream or retry."));
            }
        });
        send("loading");
        owner.setMediaItem(MediaItem.fromUri(Uri.parse(url)), position);
        owner.prepare();
        owner.setPlayWhenReady(play);
        state();
    }

    private void markReady() {
        markLoaded();
        if (!ready) { ready = true; state(); send("ready"); }
    }

    private void markLoaded() {
        if (loaded) return;
        loaded = true;
        state();
        // Recreating codecs after backgrounding is still the same media session.
        // A second loadedmetadata would reapply the original resume seek and autoplay.
        if (!metadataPublishedForSession) { metadataPublishedForSession = true; send("loaded"); }
    }

    private void updateTracks(Tracks tracks) {
        choices.clear();
        JSONArray result = new JSONArray();
        int groupIndex = 0;
        for (Tracks.Group group : tracks.getGroups()) {
            int type = group.getType();
            for (int index = 0; index < group.length; index++) {
                if ((type != C.TRACK_TYPE_AUDIO && type != C.TRACK_TYPE_TEXT) || !group.isTrackSupported(index)) continue;
                int id = groupIndex * 10000 + index + 1;
                choices.put(id, new TrackChoice(group, index, type));
                Format format = group.getTrackFormat(index);
                String title = format.label;
                if (title == null || title.trim().isEmpty()) title = format.language == null ? "Track " + (index + 1) : format.language;
                if (type == C.TRACK_TYPE_AUDIO && format.channelCount > 0) title += " · " + format.channelCount + "ch";
                result.put(object("id", id, "type", type == C.TRACK_TYPE_AUDIO ? "audio" : "sub", "title", title,
                    "lang", format.language == null ? "und" : format.language, "selected", group.isTrackSelected(index)));
            }
            groupIndex++;
        }
        emit.accept(object("type", "tracks", "session", session, "tracks", result));
        if (audioChoice != null) select(C.TRACK_TYPE_AUDIO, audioChoice);
        select(C.TRACK_TYPE_TEXT, subtitleChoice);
    }

    private void select(int type, String id) {
        if (selector == null) return;
        var builder = selector.buildUponParameters().clearOverridesOfType(type);
        if (type == C.TRACK_TYPE_TEXT && id.equals("no")) {
            builder.setTrackTypeDisabled(type, true);
            clearCues();
        } else {
            TrackChoice choice;
            try { choice = choices.get(Integer.parseInt(id)); } catch (NumberFormatException ignored) { return; }
            if (choice == null || choice.type() != type) return;
            builder.setTrackTypeDisabled(type, false).addOverride(new TrackSelectionOverride(choice.group().getMediaTrackGroup(), choice.index()));
        }
        var params = builder.build();
        if (!params.equals(selector.getParameters())) selector.setParameters(params);
    }

    void state() {
        if (player == null || !active()) return;
        VideoSize size = player.getVideoSize();
        emit.accept(object("type", "state", "session", session, "state", object(
            "position", Math.max(0, player.getCurrentPosition()) / 1000.0,
            "duration", Math.max(0, player.getDuration()) / 1000.0,
            "paused", !(scrubbing ? scrubWasPlaying : player.getPlayWhenReady()), "volume", volume, "muted", muted, "rate", rate,
            "buffering", player.getPlaybackState() == Player.STATE_BUFFERING, "seeking", seeking,
            "buffered", Math.max(0, player.getBufferedPosition()) / 1000.0,
            "width", size.width, "height", size.height)));
    }

    void start() { foreground = true; create(); }
    void suspend() {
        foreground = false;
        if (player != null) { position = Math.max(0, player.getCurrentPosition()); play = scrubbing ? scrubWasPlaying : player.getPlayWhenReady(); }
        release();
    }
    void stop() {
        release();
        session = url = "";
        headers.clear();
        position = 0;
        layer.setVisibility(View.GONE);
    }
    void destroy() { stop(); http.dispatcher().cancelAll(); http.connectionPool().evictAll(); }
    private void release() {
        scrubbing=false;
        if (previews!=null) { previews.close(); previews=null; }
        ExoPlayer previous = player;
        player = null;
        selector = null;
        if (previous != null) previous.release();
        layer.setKeepScreenOn(false);
        clearCues();
        choices.clear();
    }
    private void applyVolume() { if (player != null) player.setVolume(muted ? 0 : volume); }
    private void clearCues() { bitmapSubtitles.setCues(Collections.emptyList()); publishSubtitle(""); }
    private void publishSubtitle(String text) {
        if (text.equals(subtitle)) return;
        subtitle = text;
        if (active()) emit.accept(object("type", "subtitle", "session", session, "text", text));
    }
    private void send(String type) { emit.accept(object("type", type, "session", session)); }
    private void fit(FrameLayout parent) {
        int width = parent.getWidth() - parent.getPaddingLeft() - parent.getPaddingRight();
        int height = parent.getHeight() - parent.getPaddingTop() - parent.getPaddingBottom();
        if (width <= 0 || height <= 0) return;
        int w = Math.min(width, (int) Math.round(height * aspect));
        int h = Math.min(height, (int) Math.round(width / aspect));
        if (layer.getLayoutParams().width != w || layer.getLayoutParams().height != h) layer.setLayoutParams(new FrameLayout.LayoutParams(w, h, Gravity.CENTER));
    }
    static JSONObject object(Object... values) {
        JSONObject result = new JSONObject();
        try { for (int i = 0; i < values.length; i += 2) result.put((String) values[i], values[i + 1]); }
        catch (JSONException impossible) { throw new IllegalArgumentException(impossible); }
        return result;
    }
}
