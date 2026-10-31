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
  tracks: NativeTrack[] = [];

  constructor(private bridge: DesktopBridge) {
    super();
    this.unsubscribe = bridge.subscribe((message) => this.receive(message));
  }

  get src() { return this.source; }
  get currentSrc() { return this.source; }
  get currentTime() { return this.state.position; }
  set currentTime(position: number) {
    if (!Number.isFinite(position) || position < 0) return;
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
    if (this.session) this.bridge.send({ type: "volume", session: this.session, volume: this.state.volume });
    this.fire("volumechange");
  }
  get muted() { return this.state.muted; }
  set muted(muted: boolean) {
    this.state.muted = muted;
    if (this.session) this.bridge.send({ type: "muted", session: this.session, muted });
    this.fire("volumechange");
  }
  get playbackRate() { return this.state.rate; }
  set playbackRate(rate: number) {
    if (!Number.isFinite(rate)) return;
    this.state.rate = Math.max(0.25, Math.min(4, rate));
    if (this.session) this.bridge.send({ type: "rate", session: this.session, rate: this.state.rate });
    this.fire("ratechange");
  }

  load(url: string, headers?: Record<string, string>) {
    if (this.disposed) return;
    if (this.session) this.bridge.send({ type: "stop", session: this.session });
    this.source = url;
    this.session = crypto.randomUUID();
    this.loaded = this.ready = this.finished = false;
    this.failure = null;
    this.tracks = [];
    const { volume, muted, rate } = this.state;
    this.state = { ...initialState(), volume, muted, rate };
    this.fire("emptied", "loadstart");
    try {
      if (!["http:", "https:"].includes(new URL(url).protocol)) throw new Error("Choose an HTTP or HTTPS stream for desktop playback.");
      this.bridge.send({ type: "load", session: this.session, url, headers });
      this.bridge.send({ type: "volume", session: this.session, volume });
      this.bridge.send({ type: "muted", session: this.session, muted });
      this.bridge.send({ type: "rate", session: this.session, rate });
    } catch (error) { this.fail(error instanceof Error ? error.message : "Could not load this stream."); }
  }

  play(): Promise<void> {
    if (this.disposed) return Promise.reject(new Error("Player has been closed"));
    if (this.failure) return Promise.reject(new Error(this.failure.message));
    this.bridge.send({ type: "play", session: this.session });
    return Promise.resolve();
  }
  pause() { if (!this.disposed) this.bridge.send({ type: "pause", session: this.session }); }
  selectTrack(kind: "audio" | "subtitle", id: string) {
    this.bridge.send({ type: "track", session: this.session, kind, id });
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    if (this.session) this.bridge.send({ type: "stop", session: this.session });
  }
  private fire(...names: string[]) { names.forEach((name) => this.dispatchEvent(new Event(name))); }
  private fail(message: string) {
    this.failure = { code: 4, message };
    this.fire("error");
  }
  private receive(message: NativeMessage) {
    if (this.disposed || !("session" in message) || message.session !== this.session) return;
    switch (message.type) {
      case "state": {
        const previous = this.state;
        this.state = message.state;
        if (previous.position !== this.state.position) this.fire("timeupdate");
        if (previous.duration !== this.state.duration) this.fire("durationchange");
        if (previous.paused !== this.state.paused) this.fire(this.state.paused ? "pause" : "play");
        if (previous.volume !== this.state.volume || previous.muted !== this.state.muted) this.fire("volumechange");
        if (previous.rate !== this.state.rate) this.fire("ratechange");
        if (previous.seeking !== this.state.seeking) this.fire(this.state.seeking ? "seeking" : "seeked");
        if (previous.buffering !== this.state.buffering) this.fire(this.state.buffering ? "waiting" : "canplay");
        if (previous.width !== this.state.width || previous.height !== this.state.height) this.fire("resize");
        if (previous.buffered !== this.state.buffered) this.fire("progress");
        break;
      }
      case "loaded": this.loaded = true; this.fire("durationchange", "loadedmetadata"); break;
      case "ready":
        this.ready = true;
        this.fire("loadeddata", "canplay", "canplaythrough");
        if (!this.state.paused) this.fire("playing");
        break;
      case "loading": this.fire("waiting"); break;
      case "ended": this.finished = true; this.fire("ended"); break;
      case "error": this.fail(message.message); break;
      case "tracks": this.tracks = message.tracks; this.fire("trackschange"); break;
    }
  }
}
