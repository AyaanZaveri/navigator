import { readPlaybackPreferences } from "@/lib/media/playback-preferences";
import { preferredAudioTrack } from "@/lib/media/audio-language";
import type { DesktopBridge, NativeMessage, NativeState, NativeTrack } from "./bridge";

function ranges(end: number): TimeRanges {
  const length = Number.isFinite(end) && end > 0 ? 1 : 0;
  const validate = (index: number) => {
    if (index !== 0 || !length) throw new DOMException("Time range index is out of bounds", "IndexSizeError");
  };
  return { length, start(index) { validate(index); return 0; }, end(index) { validate(index); return end; } };
}

const initialState = (): NativeState => ({
  position: 0, duration: 0, paused: true, volume: 1, muted: false, rate: 1,
  buffering: false, seeking: false, buffered: 0, width: 0, height: 0,
});

/** The HTML media contract used by our controls, backed by native playback. */
export class MpvController extends EventTarget {
  private state = initialState();
  private unsubscribe: (() => void) | undefined;
  private session = "";
  private source = "";
  private disposed = false;
  private loaded = false;
  private ready = false;
  private failure: { code: number; message: string } | null = null;
  private finished = false;
  private pending = new Map<"position" | "paused" | "volume" | "muted" | "rate", { value: number | boolean; until: number }>();
  private optimistic(key: "position" | "paused" | "volume" | "muted" | "rate", value: number | boolean) {
    if (this.bridge.platform !== "windows") return;
    this.pending.set(key, { value, until: Date.now() + (key === "position" ? 2000 : 1000) });
    this.state = { ...this.state, [key]: value };
  }
  tracks: NativeTrack[] = [];
  subtitleText = "";
  private previewId = 0;
  private previewFrames = new Map<number, string>();
  private decodedPreviews = new Map<number, HTMLImageElement>();
  cachedPreview(position: number) { return this.previewFrames.get(position); }
  private rememberPreview(position: number, src: string) {
    if (this.previewFrames.get(position) === src) return;
    this.previewFrames.delete(position);
    this.previewFrames.set(position, src);
    while (this.previewFrames.size > 256) this.previewFrames.delete(this.previewFrames.keys().next().value!);
    // Decode proactively too: a JPEG string alone isn't a paint-ready image.
    if (typeof Image !== "undefined") {
      const image = new Image(); image.src = src;
      void image.decode?.().catch(() => {});
      this.decodedPreviews.set(position, image);
      while (this.decodedPreviews.size > 24) this.decodedPreviews.delete(this.decodedPreviews.keys().next().value!);
    }
  }
  private previewActive = false;
  private previewPending?: { id: number; resolve: (src: string | null) => void; timer: ReturnType<typeof setTimeout> };

  constructor(private bridge: DesktopBridge) {
    super();
    this.unsubscribe = bridge.subscribe((message) => this.receive(message));
  }

  get src() { return this.source; }
  get previewSession() { return this.session; }
  get currentSrc() { return this.source; }
  get currentTime() { return this.state.position; }
  set currentTime(position: number) {
    if (this.disposed || !this.session || !Number.isFinite(position) || position < 0) return;
    if (this.bridge.platform === "windows") {
      this.optimistic("position", position);
      this.state.seeking = true;
      this.fire("seeking", "timeupdate");
    }
    this.bridge.send({ type: "seek", session: this.session, position });
  }
  get duration() { return this.loaded ? this.state.duration : Number.NaN; }
  get paused() { return this.state.paused; }
  get ended() { return this.finished; }
  get seeking() { return this.state.seeking; }
  get error() { return this.failure; }
  get readyState() { return this.ready && !this.state.buffering ? 4 : this.loaded ? 2 : 0; }
  get networkState() { return this.failure ? 3 : this.source ? (this.ready ? 1 : 2) : 0; }
  get buffered() { return ranges(Math.max(this.state.position, this.state.buffered)); }
  get seekable() { return ranges(this.state.duration); }
  get videoWidth() { return this.state.width; }
  get videoHeight() { return this.state.height; }
  get volume() { return this.state.volume; }
  set volume(volume: number) {
    if (!Number.isFinite(volume)) return;
    this.state.volume = Math.max(0, Math.min(1, volume));
    if (this.session) this.optimistic("volume", this.state.volume);
    if (this.session) this.bridge.send({ type: "volume", session: this.session, volume: this.state.volume });
    this.fire("volumechange");
  }
  get muted() { return this.state.muted; }
  set muted(muted: boolean) {
    this.state.muted = muted;
    if (this.session) this.optimistic("muted", muted);
    if (this.session) this.bridge.send({ type: "muted", session: this.session, muted });
    this.fire("volumechange");
  }
  get playbackRate() { return this.state.rate; }
  set playbackRate(rate: number) {
    if (!Number.isFinite(rate)) return;
    this.state.rate = Math.max(0.25, Math.min(4, rate));
    if (this.session) this.optimistic("rate", this.state.rate);
    if (this.session) this.bridge.send({ type: "rate", session: this.session, rate: this.state.rate });
    this.fire("ratechange");
  }

  private audioChosen = false;

  load(url: string, headers?: Record<string, string>, startPosition = 0) {
    this.cancelPreview();
    if (this.disposed) return;
    this.pending.clear();
    if (this.session) this.bridge.send({ type: "stop", session: this.session });
    this.previewFrames.clear(); this.decodedPreviews.clear();
    this.source = url;
    this.session = crypto.randomUUID();
    this.loaded = this.ready = this.finished = false;
    this.failure = null;
    this.tracks = [];
    this.audioChosen = false;
    this.subtitleText = "";
    const { volume, muted, rate } = this.state;
    this.state = { ...initialState(), volume, muted, rate };
    this.fire("emptied", "loadstart");
    try {
      if (!["http:", "https:"].includes(new URL(url).protocol)) throw new Error("Choose an HTTP or HTTPS stream for native playback.");
      this.bridge.send({ type: "load", session: this.session, url, headers,
        ...(["android", "ios"].includes(this.bridge.platform) ? { startPosition: Number.isFinite(startPosition) ? Math.max(0, startPosition) : 0 } : {}) });
      // iOS owns device volume. A cached HTML-media gain must not overwrite
      // the current hardware level when a title starts or the source switches.
      if (!(this.bridge.platform === "ios" && this.bridge.capabilities?.systemVolume)) {
        this.bridge.send({ type: "volume", session: this.session, volume });
        this.bridge.send({ type: "muted", session: this.session, muted });
      }
      this.bridge.send({ type: "rate", session: this.session, rate });
    } catch (error) { this.fail(error instanceof Error ? error.message : "Could not load this stream."); }
  }

  play(): Promise<void> {
    if (this.disposed) return Promise.reject(new Error("Player has been closed"));
    if (this.failure) return Promise.reject(new Error(this.failure.message));
    if (this.bridge.platform === "windows") {
      const paused = this.state.paused;
      if (paused) this.optimistic("paused", false);
      if (paused) this.fire("play");
    }
    this.bridge.send({ type: "play", session: this.session });
    return Promise.resolve();
  }
  pause() {
    if (this.disposed) return;
    if (this.bridge.platform === "windows") {
      const paused = this.state.paused;
      this.optimistic("paused", true);
      if (!paused) this.fire("pause");
    }
    this.bridge.send({ type: "pause", session: this.session });
  }
  selectTrack(kind: "audio" | "subtitle", id: string) {
    if (kind === "audio") this.audioChosen = true;
    if (kind === "subtitle" && id === "no") this.clearSubtitle();
    this.bridge.send({ type: "track", session: this.session, kind, id });
  }
  preview(position: number): Promise<string | null> {
    const cached = this.cachedPreview(position);
    if (cached && !this.disposed) {
      if (this.previewPending) this.cancelPreview();
      return Promise.resolve(cached);
    }
    this.cancelPreview();
    if (this.disposed || !this.session || !Number.isFinite(position) || position < 0) return Promise.resolve(null);
    const id = ++this.previewId;
    this.previewActive = true;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (this.previewPending?.id === id) { this.previewPending = undefined; resolve(null); }
      }, 6000);
      this.previewPending = { id, resolve, timer };
      this.bridge.send({ type: "thumbnail", session: this.session, request: id, position });
    });
  }
  cancelPreview() {
    if (this.previewPending) {
      clearTimeout(this.previewPending.timer);
      this.previewPending.resolve(null);
    }
    this.previewPending = undefined;
    if (this.previewActive) this.bridge.send({ type: "thumbnail", session: this.session, request: ++this.previewId, position: null });
    this.previewActive = false;
  }
  dispose() {
    this.cancelPreview();
    if (this.disposed) return;
    this.disposed = true;
    this.pending.clear();
    this.previewFrames.clear(); this.decodedPreviews.clear();
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    if (this.session) this.bridge.send({ type: "stop", session: this.session });
  }
  private fire(...names: string[]) { names.forEach((name) => this.dispatchEvent(new Event(name))); }
  private clearSubtitle() {
    if (!this.subtitleText) return;
    this.subtitleText = "";
    this.fire("subtitlechange");
  }
  private fail(message: string) {
    this.pending.clear();
    this.cancelPreview();
    this.clearSubtitle();
    this.failure = { code: 4, message };
    this.fire("error");
  }
  private receive(message: NativeMessage) {
    if (this.disposed || !("session" in message) || message.session !== this.session) return;
    switch (message.type) {
      case "thumbnail-frame":
        if (!Number.isFinite(message.position) || message.position < 0 || !message.src?.startsWith("data:image/jpeg;base64,")) break;
        this.rememberPreview(message.position, message.src);
        this.dispatchEvent(new CustomEvent("previewframe", { detail: { position: message.position, src: message.src } }));
        break;
      case "thumbnail":
        if (this.previewPending?.id === message.request) {
          const pending = this.previewPending;
          clearTimeout(pending.timer);
          this.previewPending = undefined;
          const src = message.src?.startsWith("data:image/jpeg;base64,") ? message.src : null;
          if (src && message.position !== null && Number.isFinite(message.position)) this.rememberPreview(message.position, src);
          pending.resolve(src);
        }
        break;
      case "state": {
        const previous = this.state;
        const confirmingPlay = this.pending.get("paused")?.value === false && message.state.paused === false;
        const incoming = { ...message.state };
        for (const [key, pending] of this.pending) {
          const acknowledged = key === "position"
            ? Math.abs(incoming.position - (pending.value as number)) < 0.5
            : incoming[key] === pending.value;
          if (acknowledged || Date.now() >= pending.until) this.pending.delete(key);
          else Object.assign(incoming, { [key]: pending.value });
        }
        if (this.pending.has("position")) incoming.seeking = true;
        this.state = incoming;
        if (previous.position !== this.state.position) this.fire("timeupdate");
        if (previous.duration !== this.state.duration) this.fire("durationchange");
        if (previous.paused !== this.state.paused) this.fire(this.state.paused ? "pause" : "play");
        if (previous.volume !== this.state.volume || previous.muted !== this.state.muted) this.fire("volumechange");
        if (previous.rate !== this.state.rate) this.fire("ratechange");
        if (previous.seeking !== this.state.seeking) this.fire(this.state.seeking ? "seeking" : "seeked");
        if (previous.buffering !== this.state.buffering) {
          if (this.state.buffering) this.fire("waiting");
          // Cache/metadata updates can arrive before the replacement stream's
          // first frame. Only its session-scoped ready event can uncover video.
          else if (this.ready) this.fire("canplay");
        }
        if (previous.width !== this.state.width || previous.height !== this.state.height) this.fire("resize");
        if (previous.buffered !== this.state.buffered) this.fire("progress");
        if (this.ready && !this.state.paused && !this.state.buffering && !this.state.seeking &&
            (confirmingPlay || previous.paused || previous.buffering || previous.seeking)) this.fire("playing");
        break;
      }
      case "loaded": this.loaded = true; this.fire("durationchange", "loadedmetadata"); break;
      case "ready":
        this.ready = true;
        this.fire("loadeddata", "canplay", "canplaythrough");
        if (!this.state.paused) this.fire("playing");
        break;
      case "loading": this.clearSubtitle(); this.fire("waiting"); break;
      case "ended": this.clearSubtitle(); this.finished = true; this.fire("ended"); break;
      case "error": this.fail(message.message); break;
      case "tracks": {
        this.tracks = message.tracks;
        if (!this.audioChosen) {
          const english = preferredAudioTrack(this.tracks.filter(track => track.type === "audio"), readPlaybackPreferences().audioLanguage);
          if (english) {
            this.audioChosen = true;
            if (!english.selected) this.bridge.send({ type: "track", session: this.session, kind: "audio", id: String(english.id) });
          }
        }
        this.fire("trackschange");
        break;
      }
      case "subtitle":
        if (this.subtitleText !== message.text) {
          this.subtitleText = message.text;
          this.fire("subtitlechange");
        }
        break;
    }
  }
}
