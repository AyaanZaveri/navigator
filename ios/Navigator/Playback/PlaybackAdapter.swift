import AVFAudio
import Foundation
import UIKit

@MainActor final class PlaybackAdapter {
  private static weak var active: PlaybackAdapter?
  let engine = NativeVLC()
  // Keep VLC's drawable renderable while covering undecoded/resume frames.
  let startupCover: UIView = {
    let view = UIView()
    view.backgroundColor = .black
    view.isUserInteractionEnabled = false
    return view
  }()
  let previews = PreviewWorker()
  var emit: ([String: Any]) -> Void = { _ in }
  private(set) var session = ""
  private var gateway: MediaGateway?
  private var effectiveURL: URL?
  private var generation = UUID()
  private var loadTask: Task<Void, Never>?
  private var timer: Timer?
  private var foreground = true, pendingStart = false, wantsPlay = true
  private var loaded = false, ready = false, seeking = false, errorSent = false
  private var started = false
  private var positionFloor: Double?
  private var scrubOwner: String?
  var invalidateInteraction: () -> Void = {}
  var relinquishInteraction: () -> Void = {}
  var canInteract: Bool {
    started && ready && foreground && !errorSent && engine.seekable && engine.duration > 0
  }
  var interactionPosition: Double { max(engine.position, positionFloor ?? 0) }
  var interactionVolume: Double { muted ? 0 : volume }
  private var initialPosition = 0.0, volume = 1.0, muted = false, rate = 1.0, fit = "fit"
  private var lastTracks = Data()
  private var lastAudibleVolume = 1.0
  init() {
    engine.changed = { [weak self] in
      // VLCKit delivers delegates on main. Read terminal state in this callback
      // before its subsequent Stopped event replaces the cached Ended state.
      if Thread.isMainThread {
        MainActor.assumeIsolated { self?.update() }
      } else {
        DispatchQueue.main.async { self?.update() }
      }
    }
    timer = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self] _ in
      Task { @MainActor in self?.update() }
    }
  }
  func handle(_ command: BridgeCommand) throws {
    if command.type == "load" {
      let url = try StreamPolicy.url(command.body["url"] as? String ?? "")
      let headers = try StreamPolicy.headers(command.body["headers"] as? [String: String] ?? [:])
      stop()
      session = command.session ?? ""
      let owner = generation
      wantsPlay = true
      initialPosition = command.number("startPosition", range: 0...2_000_000) ?? 0
      positionFloor = initialPosition
      startupCover.isHidden = false
      emitEvent("loading")
      loadTask = Task { [weak self] in
        guard let self else { return }
        do {
          let playable: URL
          if headers.isEmpty {
            playable = url
          } else {
            let gateway = MediaGateway(source: url, headers: headers)
            self.gateway = gateway
            playable = try await gateway.start()

          }
          guard !Task.isCancelled, self.generation == owner else { return }
          self.effectiveURL = playable
          self.previews.reset(source: playable) { [weak self] id, at, data in
            guard let self, self.generation == owner else { return }
            let src = data.map { "data:image/jpeg;base64," + $0.base64EncodedString() }
            self.emit([
              "type": "thumbnail", "session": self.session, "request": id, "position": at,
              "src": src as Any? ?? NSNull(),
            ])
          }
          if self.foreground { try self.beginPlayback(playable) } else { self.pendingStart = true }
        } catch {
          guard self.generation == owner else { return }
          self.gateway?.stop()
          self.gateway = nil
          self.emitError("Could not open this stream. Try another source.")
        }
      }
      return
    }
    guard command.session == session, !session.isEmpty else { return }
    switch command.type {
    case "play":
      invalidateInteraction()
      if foreground {
        try activate()
        wantsPlay = true
        engine.play()
      }
    case "pause": pause()
    case "stop": stop()
    case "seek":
      invalidateInteraction()
      if let at = command.number("position", range: 0...2_000_000) {
        positionFloor = nil
        seeking = true
        engine.seek(engine.duration > 0 ? min(at, engine.duration) : at)
      }
    case "volume":
      if let v = command.number("volume", range: 0...1) {
        volume = v
        if v > 0 { lastAudibleVolume = v }
        engine.setVolume(v, muted: muted)
      }
    case "muted":
      if let v = command.body["muted"] as? Bool {
        muted = v
        engine.setVolume(volume, muted: v)
      }
    case "rate":
      if let v = command.number("rate", range: 0.25...4) {
        rate = v
        engine.setRate(v)
      }
    case "track":
      let kind = command.body["kind"] as? String ?? ""
      let id = command.body["id"] as? String ?? "no"
      if ["audio", "subtitle"].contains(kind), let n = id == "no" ? -1 : Int(id), n >= (-1),
        n <= Int(Int32.max)
      {
        engine.selectKind(kind, identifier: Int32(n))
      }
    case "video-fit":
      if let value = command.body["mode"] as? String, ["fit", "crop", "stretch"].contains(value) {
        fit = value
        layout()
      }
    case "thumbnail":
      if command.body["position"] is NSNull {
        previews.request(id: 0, time: nil)
      } else if let id = command.number("request", range: 0...Double(Int32.max)),
        let at = command.number("position", range: 0...2_000_000)
      {
        previews.request(id: Int(id), time: at)
      }
    default: break
    }
    update()
  }
  private func activate() throws {
    if let other = Self.active, other !== self {
      other.pause()
      other.relinquishInteraction()
    }
    Self.active = self
    let audio = AVAudioSession.sharedInstance()
    try audio.setCategory(.playback, mode: .moviePlayback)
    try audio.setActive(true)
  }
  private func beginPlayback(_ url: URL) throws {

    try activate()
    pendingStart = false
    engine.setVolume(volume, muted: muted)
    engine.setRate(rate)
    engine.load(url, start: initialPosition, silent: false)
    started = true

    if !wantsPlay { engine.pause() }
  }
  func pause() {
    wantsPlay = false
    invalidateInteraction()
    scrubOwner = nil
    engine.pause()
    update()
  }
  func suspend() {
    foreground = false
    pause()
    previews.suspend()
    engine.setRenderingEnabled(false)
    if Self.active === self {
      try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
  }
  func resumeRendering() {
    foreground = true
    engine.setRenderingEnabled(true)
    if pendingStart, let url = effectiveURL {
      do { try beginPlayback(url) } catch { emitError("Could not activate audio playback.") }
    }
  }
  func stop() {
    started = false
    invalidateInteraction()
    scrubOwner = nil
    positionFloor = nil
    generation = UUID()
    loadTask?.cancel()
    loadTask = nil
    previews.reset(source: nil, ready: nil)
    engine.stop()
    startupCover.isHidden = false
    gateway?.stop()
    gateway = nil
    effectiveURL = nil
    session = ""
    pendingStart = false
    loaded = false
    ready = false
    seeking = false
    errorSent = false
    lastTracks = Data()
    if Self.active === self {
      Self.active = nil
      try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
  }
  func beginScrub() -> Bool {
    guard canInteract, scrubOwner == nil else { return false }
    scrubOwner = session
    engine.pause()
    return true
  }
  func endScrub(owner: String, commit: Bool, position: Double) {
    guard scrubOwner == owner, owner == session else { return }
    scrubOwner = nil
    guard started && foreground && !errorSent else { return }
    if commit {
      positionFloor = nil
      seeking = true
      engine.seek(max(0, min(engine.duration, position)))
    }
    if wantsPlay { engine.play() }
    update()
  }
  func setInteractionVolume(_ value: Double) {
    volume = max(0, min(1, value))
    if volume > 0 { lastAudibleVolume = volume }
    muted = volume == 0
    engine.setVolume(volume, muted: muted)
    update()
  }
  func toggleInteractionMute() {
    if muted || volume == 0 {
      muted = false
      if volume == 0 { volume = lastAudibleVolume }
    } else {
      muted = true
    }
    engine.setVolume(volume, muted: muted)
    update()
  }
  func layout() {
    engine.setFit(
      fit, width: Int(engine.surface.bounds.width), height: Int(engine.surface.bounds.height))
  }
  private func emitEvent(_ type: String) { emit(["type": type, "session": session]) }
  private func emitError(_ message: String) {
    emit(["type": "error", "session": session, "message": message])
  }
  private func update() {
    guard !session.isEmpty, started else { return }
    let size = engine.videoSize
    let rawPosition = engine.position
    // start-time plus precise seeking governs which frames VLC presents. Its
    // cached input clock can still report an earlier preroll timestamp, notably
    // when a short input has reached EOF while its decoder drains frames.
    let at = max(rawPosition, positionFloor ?? 0)
    if let floor = positionFloor, rawPosition >= floor { positionFloor = nil }
    let duration = engine.duration
    emit([
      "type": "state", "session": session,
      "state": [
        "position": at, "duration": duration,
        "paused": !wantsPlay, "volume": volume, "muted": muted, "rate": rate,
        "buffering": scrubOwner == nil && engine.buffering, "seeking": seeking, "buffered": 0,
        "width": size.width,
        "height": size.height,
      ],
    ])
    if !loaded, duration > 0 {
      loaded = true
      emitEvent("loaded")
    }
    if !ready, !engine.buffering, engine.playing,
      engine.hasVideo || !engine.hasVideoTrack
    {
      ready = true
      engine.setVolume(volume, muted: muted)
      engine.setRate(rate)
      layout()
      startupCover.isHidden = true
      emitEvent("ready")
    }
    if seeking, !engine.buffering { seeking = false }
    let tracks = engine.tracks()
    if let data = try? JSONSerialization.data(withJSONObject: tracks, options: .sortedKeys),
      data != lastTracks
    {
      lastTracks = data
      emit(["type": "tracks", "session": session, "tracks": tracks])
    }
    if engine.failed, !errorSent {
      errorSent = true
      invalidateInteraction()
      emitError("Playback failed. Try another stream or retry.")
    }
    if engine.ended, !errorSent {
      errorSent = true
      invalidateInteraction()
      emitEvent("ended")
    }
  }
  func close() {
    timer?.invalidate()
    timer = nil
    stop()
    engine.changed = nil
    emit = { _ in }
  }
}
