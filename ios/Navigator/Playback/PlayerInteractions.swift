import UIKit
import WebKit

@MainActor private final class PlayerPan: UIGestureRecognizer {
  var model: PlayerGesture?
  private(set) var point = CGPoint.zero
  override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
    guard event.allTouches?.count == 1, let touch = touches.first, model != nil else {
      state = state == .possible ? .failed : .cancelled
      return
    }
    point = touch.location(in: view)
  }
  override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent) {
    guard event.allTouches?.count == 1, let touch = touches.first else {
      state = state == .possible ? .failed : .cancelled
      return
    }
    point = touch.location(in: view)
    model?.move(point)
    if model?.mode != .undecided { state = state == .possible ? .began : .changed }
  }
  override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent) {
    if let touch = touches.first {
      point = touch.location(in: view)
      model?.move(point)
    }
    state = state == .possible ? .failed : .ended
  }
  override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent) {
    state = state == .possible ? .failed : .cancelled
  }
  override func reset() {
    super.reset()
    model = nil
  }
}

@MainActor final class PlayerInteractions: NSObject, UIGestureRecognizerDelegate {
  private unowned let host: UIView
  private unowned let playback: PlaybackAdapter
  private let overlay = PlayerPanelBase()
  private let back = UIButton(type: .system)
  private let backMaterial = PlayerMaterial(radius: 22, interactive: true)
  private let speaker = UIButton(type: .system)
  private let speakerMaterial = PlayerMaterial(radius: 22, interactive: true)
  private let preview = PlayerMaterial(radius: 22)
  private let panel = PlayerSidePanel()
  private let brightness = PlaybackBrightness()
  private var pan: PlayerPan!
  private var displayLink: CADisplayLink?
  private var latestScrub: (position: Double, speed: Double, x: Double)?
  private var layout: PlayerLayout?
  private var layoutSession = ""
  private var scrubSession: String?
  private var sideInitial = 0.0
  private var endpoint: Int?
  private var hideTask: Task<Void, Never>?
  private var visible = false
  private var size = CGSize.zero
  private var accessibilityObservers: [NSObjectProtocol] = []
  private let feedback = UISelectionFeedbackGenerator()
  var close: () -> Void = {}
  init(host: UIView, web: WKWebView, playback: PlaybackAdapter) {
    self.host = host
    self.playback = playback
    super.init()
    preview.isUserInteractionEnabled = false
    host.insertSubview(preview, belowSubview: web)
    overlay.frame = host.bounds
    overlay.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    host.addSubview(overlay)
    for (button, material, symbol, label) in [
      (back, backMaterial, "arrow.left", "Back"),
      (speaker, speakerMaterial, "speaker.wave.2", "Volume controls"),
    ] {
      material.frame.size = CGSize(width: 44, height: 44)
      overlay.addSubview(material)
      button.frame = material.bounds
      button.autoresizingMask = [.flexibleWidth, .flexibleHeight]
      button.setImage(
        UIImage(
          systemName: symbol,
          withConfiguration: UIImage.SymbolConfiguration(pointSize: 24, weight: .regular)),
        for: .normal)
      button.tintColor = .white
      button.accessibilityLabel = label
      material.content.addSubview(button)
    }
    back.accessibilityIdentifier = "native-player-back"
    speaker.accessibilityIdentifier = "native-player-volume"
    back.addTarget(self, action: #selector(goBack), for: .touchUpInside)
    speaker.addTarget(self, action: #selector(toggleVolume), for: .touchUpInside)
    overlay.addSubview(panel)
    panel.changed = { [weak self] value in
      guard let self else { return }
      self.hideTask?.cancel()
      self.applySide(value, volume: self.panel.isVolume)
    }
    pan = PlayerPan(target: self, action: #selector(drag(_:)))
    pan.delegate = self
    pan.cancelsTouchesInView = true
    pan.delaysTouchesBegan = false
    host.addGestureRecognizer(pan)
    web.scrollView.panGestureRecognizer.require(toFail: pan)
    for name in [
      UIAccessibility.reduceTransparencyStatusDidChangeNotification,
      UIAccessibility.reduceMotionStatusDidChangeNotification,
    ] {
      accessibilityObservers.append(
        NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) {
          [weak self] _ in
          Task { @MainActor in self?.refreshMaterials() }
        })
    }
  }
  func setVisible(_ value: Bool) {
    visible = value
    if !value {
      reset()
      brightness.release()
    }
    renderLayout()
  }
  func receive(_ body: [String: Any], session: String) throws -> Bool {
    guard session == playback.session, !session.isEmpty else { return false }
    let next = try PlayerLayout(body)
    guard next.matches(host.bounds) else {
      reset()
      return false
    }
    if next.blocked { cancelGesture() }
    layout = next
    layoutSession = session
    renderLayout()
    return true
  }
  func refresh() { renderLayout() }
  func resized() {
    guard host.bounds.size != size else { return }
    size = host.bounds.size
    reset()
  }
  func suspend() {
    reset()
    brightness.release()
  }
  func invalidatePlayback() {
    cancelGesture()
    hideTask?.cancel()
    panel.hide()
    preview.present(false, animated: false)
  }
  func reset() {
    cancelGesture()
    hideTask?.cancel()
    panel.hide()
    preview.present(false, animated: false)
    backMaterial.present(false, animated: false)
    speakerMaterial.present(false, animated: false)
    layout = nil
    layoutSession = ""
  }
  private var validLayout: PlayerLayout? {
    guard visible, layoutSession == playback.session, let layout, layout.matches(host.bounds) else {
      return nil
    }
    return layout
  }
  private func renderLayout() {
    guard let layout = validLayout else {
      backMaterial.present(false, animated: false)
      speakerMaterial.present(false, animated: false)
      preview.present(false, animated: false)
      return
    }
    if let rect = layout.close, !layout.blocked {
      backMaterial.frame = CGRect(x: rect.midX - 22, y: rect.midY - 22, width: 44, height: 44)
    }
    let showBack = layout.close != nil && !layout.blocked
    if backMaterial.isHidden == showBack { backMaterial.present(showBack) }
    let showSpeaker = layout.controlsVisible && !layout.blocked && playback.canInteract
    speakerMaterial.frame = CGRect(
      x: host.bounds.width - host.safeAreaInsets.right - 60, y: host.safeAreaInsets.top + 16,
      width: 44, height: 44)
    if speakerMaterial.isHidden == showSpeaker { speakerMaterial.present(showSpeaker) }
    if let rect = layout.preview, !layout.blocked {
      preview.frame = rect
      if preview.isHidden { preview.present(true, animated: false) }
    } else if !preview.isHidden {
      preview.present(false, animated: false)
    }
    if layout.blocked { panel.hide() }
  }
  func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch)
    -> Bool
  {
    guard let layout = validLayout, !layout.blocked, playback.canInteract,
      !UIAccessibility.isVoiceOverRunning
    else { return false }
    if pan.model != nil { return true }
    let point = touch.location(in: host)
    let insets = host.safeAreaInsets
    guard point.x >= max(24, insets.left), point.x <= host.bounds.width - max(24, insets.right),
      point.y >= insets.top + 8, point.y <= host.bounds.height - insets.bottom - 8,
      !layout.exclusions.contains(where: { $0.insetBy(dx: -4, dy: -4).contains(point) }),
      backMaterial.isHidden || !backMaterial.frame.contains(point),
      speakerMaterial.isHidden || !speakerMaterial.frame.contains(point),
      panel.isHidden || !panel.frame.contains(point)
    else { return false }
    pan.model = PlayerGesture(
      point: point, size: host.bounds.size, position: playback.interactionPosition,
      duration: playback.engine.duration)
    return true
  }
  @objc private func drag(_ sender: PlayerPan) {
    guard let model = sender.model else { return }
    switch sender.state {
    case .began:
      guard validLayout != nil, playback.canInteract else {
        cancelGesture()
        return
      }
      hideTask?.cancel()
      endpoint = nil
      feedback.prepare()
      feedback.selectionChanged()
      if model.mode == .scrub {
        panel.hide()
        guard playback.beginScrub() else {
          cancelGesture()
          return
        }
        scrubSession = playback.session
        displayLink = CADisplayLink(target: self, selector: #selector(flushScrub))
        displayLink?.add(to: .main, forMode: .common)
      } else {
        let volume = model.mode == .volume
        guard volume || host.window?.screen === UIScreen.main else {
          cancelGesture()
          return
        }
        sideInitial = volume ? playback.interactionVolume : brightness.value
        showPanel(volume: volume, value: sideInitial)
      }
      updateDrag(model, point: sender.point)
    case .changed: updateDrag(model, point: sender.point)
    case .ended:
      updateDrag(model, point: sender.point)
      finishScrub(commit: true)
      dismissPanelLater()
    case .cancelled, .failed:
      finishScrub(commit: false)
      panel.hide()
    default: break
    }
  }
  private func updateDrag(_ model: PlayerGesture, point: CGPoint) {
    if model.mode == .scrub {
      guard scrubSession == playback.session else { return }
      latestScrub = (model.target, model.speed, point.x)
    } else {
      let value = model.sideValue(initial: sideInitial, point: point)
      panel.update(value)
      applySide(value, volume: model.mode == .volume)
    }
  }
  @objc private func flushScrub() {
    guard let value = latestScrub, let owner = scrubSession, owner == playback.session else {
      return
    }
    latestScrub = nil
    emitScrub(
      owner: owner, active: true, target: value.position, speed: value.speed, x: value.x,
      commit: false)
  }
  private func finishScrub(commit: Bool) {
    displayLink?.invalidate()
    displayLink = nil
    guard let owner = scrubSession else {
      latestScrub = nil
      return
    }
    let target = pan.model?.target ?? playback.interactionPosition
    latestScrub = nil
    scrubSession = nil
    playback.endScrub(owner: owner, commit: commit, position: target)
    if owner == playback.session {
      emitScrub(
        owner: owner, active: false, target: target, speed: 1, x: pan.point.x, commit: commit)
    }
  }
  private func emitScrub(
    owner: String, active: Bool, target: Double, speed: Double, x: Double, commit: Bool
  ) {
    playback.emit([
      "type": "scrub", "session": owner, "active": active, "position": target,
      "duration": playback.engine.duration, "speed": speed, "x": x, "commit": commit,
    ])
  }
  private func cancelGesture() {
    finishScrub(commit: false)
    pan.isEnabled = false
    pan.isEnabled = true
  }
  private func applySide(_ value: Double, volume: Bool) {
    if volume { playback.setInteractionVolume(value) } else { brightness.set(value) }
    let limit = value <= 0 ? 0 : value >= 1 ? 1 : nil
    if let limit, endpoint != limit { feedback.selectionChanged() }
    endpoint = limit
  }
  private func showPanel(volume: Bool, value: Double) {
    let available = host.bounds.inset(by: host.safeAreaInsets).insetBy(dx: 16, dy: 16)
    let width = min(320, available.width)
    let height = min(available.height, volume ? 280 : 176)
    panel.frame = CGRect(
      x: volume ? available.maxX - width : available.minX, y: available.midY - height / 2,
      width: width, height: height)
    panel.show(volume: volume, value: value)
  }
  private func dismissPanelLater() {
    guard !panel.isHidden, !UIAccessibility.isVoiceOverRunning else { return }
    hideTask?.cancel()
    hideTask = Task { [weak self] in
      try? await Task.sleep(for: .seconds(1.5))
      guard !Task.isCancelled else { return }
      self?.panel.hide()
    }
  }
  @objc private func toggleVolume() {
    hideTask?.cancel()
    if !panel.isHidden && panel.isVolume {
      panel.hide()
    } else {
      showPanel(volume: true, value: playback.interactionVolume)
    }
  }
  @objc private func goBack() {
    suspend()
    close()
  }
  private func refreshMaterials() {
    for material in [backMaterial, speakerMaterial, preview, panel.material] {
      if !material.isHidden { material.present(true, animated: false) }
    }
  }
  func dispose() {
    suspend()
    host.removeGestureRecognizer(pan)
    accessibilityObservers.forEach(NotificationCenter.default.removeObserver)
    accessibilityObservers = []
  }
}
