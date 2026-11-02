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
  private let back = PlayerBackButton(type: .system)
  private let backMaterial = PlayerMaterial(radius: 22, interactive: true)
  private let preview = PlayerMaterial(radius: 22)
  private let panel = PlayerSidePanel()
  private let brightness = PlaybackBrightness()
  private let volume = DeviceVolumeControl()
  private(set) var chromeSession = ""
  var deviceVolumeValue: Double { volume.value }
  private var pan: PlayerPan!
  private var outsideTap: UITapGestureRecognizer!
  private var displayLink: CADisplayLink?
  private var latestScrub: (position: Double, speed: Double, x: Double)?
  private var layout: PlayerLayout?
  private var layoutSession = ""
  private var scrubSession: String?
  private var sideInitial = 0.0
  private var sideDrag: VerticalSliderDrag?
  private var endpoints = Set<Int>()
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
    overlay.addSubview(backMaterial)
    overlay.addSubview(back)
    var config: UIButton.Configuration
    if #available(iOS 26.0, *) { config = .glass() } else { config = .plain() }
    config.cornerStyle = .capsule
    config.contentInsets = .zero
    config.baseForegroundColor = .white
    config.image = UIImage(systemName: "arrow.left")
    config.preferredSymbolConfigurationForImage = UIImage.SymbolConfiguration(
      pointSize: 20, weight: .regular)
    back.configuration = config
    back.overrideUserInterfaceStyle = .dark
    back.isHidden = true
    back.accessibilityLabel = "Back"
    back.accessibilityIdentifier = "native-player-back"
    back.accessibilityCustomActions = [
      UIAccessibilityCustomAction(
        name: "Adjust brightness", target: self, selector: #selector(adjustBrightness)),
      UIAccessibilityCustomAction(
        name: "Adjust device volume", target: self, selector: #selector(adjustVolume)),
    ]
    back.addTarget(self, action: #selector(goBack), for: .touchUpInside)
    overlay.addSubview(panel)
    panel.mute = { [weak self] in self?.volume.toggleMute() }
    volume.changed = { [weak self] value in
      guard let self else { return }
      self.playback.deviceVolumeChanged()
      guard self.visible, self.validLayout != nil, self.playback.canInteract else { return }
      let adjusting =
        (self.pan?.state == .began || self.pan?.state == .changed)
        && self.pan?.model?.mode == .volume || self.panel.isTracking
      if !self.panel.isHidden && self.panel.isVolume {
        if !adjusting { self.panel.update(value) }
      } else if !adjusting, self.scrubSession == nil, self.host.window?.isKeyWindow == true {
        self.showPanel(volume: true, value: value)
      }
      if !adjusting { self.dismissPanelLater() }
    }
    panel.released = { [weak self] in self?.dismissPanelLater() }
    panel.began = { [weak self] in
      self?.hideTask?.cancel()
      self?.endpoints.removeAll()
      self?.feedback.prepare()
    }
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
    outsideTap = UITapGestureRecognizer(target: self, action: #selector(dismissPanel))
    outsideTap.delegate = self
    outsideTap.cancelsTouchesInView = false
    outsideTap.require(toFail: pan)
    host.addGestureRecognizer(outsideTap)
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
    if value && !visible { chromeSession = UUID().uuidString }
    visible = value
    if value { volume.attach(to: host) }
    if !value {
      chromeSession = ""
      volume.detach()
      reset()
      brightness.release()
    }
    renderLayout()
  }
  func receive(_ body: [String: Any], session: String) throws -> Bool {
    guard visible, session == chromeSession, !session.isEmpty else { return false }
    let next = try PlayerLayout(body)
    guard next.matches(host.bounds) else {
      reset()
      return false
    }
    if next.blocked { cancelGesture() }
    volume.attach(to: host)
    layout = next
    layoutSession = session
    renderLayout()
    return true
  }
  func refresh() { renderLayout() }
  func resized() -> Bool {
    guard host.bounds.size != size else { return false }
    size = host.bounds.size
    reset()
    return true
  }
  func suspend() {
    reset()
    volume.detach()
    brightness.release()
  }
  func invalidatePlayback() {
    volume.cancel()
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
    back.isHidden = true
    layout = nil
    layoutSession = ""
  }
  private var validLayout: PlayerLayout? {
    guard visible, layoutSession == chromeSession, let layout, layout.matches(host.bounds) else {
      return nil
    }
    return layout
  }
  private func renderLayout() {
    guard let layout = validLayout else {
      backMaterial.present(false, animated: false)
      back.isHidden = true
      preview.present(false, animated: false)
      return
    }
    if let rect = layout.close, !layout.blocked {
      back.frame = CGRect(x: rect.midX - 22, y: rect.midY - 22, width: 44, height: 44)
      backMaterial.frame = back.frame
    }
    let showBack = layout.close != nil && !layout.blocked
    back.isHidden = !showBack
    if #available(iOS 26.0, *) {
      backMaterial.present(false, animated: false)
    } else if backMaterial.isHidden == showBack {
      backMaterial.present(showBack)
    }
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
    if gestureRecognizer === outsideTap {
      let point = touch.location(in: host)
      return !panel.isHidden && !panel.frame.contains(point)
    }
    guard let layout = validLayout, !layout.blocked, playback.canInteract,
      !UIAccessibility.isVoiceOverRunning
    else { return false }
    if pan.model != nil { return true }
    let point = touch.location(in: host)
    let insets = host.safeAreaInsets
    guard point.x >= max(24, insets.left), point.x <= host.bounds.width - max(24, insets.right),
      point.y >= insets.top + 8, point.y <= host.bounds.height - insets.bottom - 8,
      !layout.exclusions.contains(where: { $0.insetBy(dx: -4, dy: -4).contains(point) }),
      back.isHidden || !back.frame.contains(point),
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
      endpoints.removeAll()
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
        sideInitial = volume ? self.volume.value : brightness.value
        let initialValue = model.sideValue(initial: sideInitial, point: sender.point)
        sideDrag = VerticalSliderDrag(
          value: initialValue, y: sender.point.y, span: max(200, host.bounds.height * 0.5))
        showPanel(volume: volume, value: initialValue)
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
      latestScrub = (model.target, model.speed, Double(point.x))
    } else {
      guard let value = sideDrag?.move(y: point.y) else { return }
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
    if volume {
      if !self.volume.set(value) { panel.update(self.volume.value) }
    } else {
      brightness.set(value)
    }
    let limit = value <= 0 ? 0 : value >= 1 ? 1 : nil
    if let limit, endpoints.insert(limit).inserted { feedback.selectionChanged() }
  }
  private func showPanel(volume: Bool, value: Double) {
    let insets = host.safeAreaInsets
    let metrics = SideControlMetrics(
      size: host.bounds.size,
      safeArea: CGSize(width: insets.left + insets.right, height: insets.top + insets.bottom),
      isPad: host.traitCollection.userInterfaceIdiom == .pad)
    let width = CGFloat(metrics.width)
    let height = CGFloat(metrics.height)
    panel.scale = CGFloat(metrics.scale)
    panel.frame = CGRect(
      x: volume ? host.bounds.width - max(24, insets.right) - width : max(24, insets.left),
      y: (host.bounds.height - height) / 2, width: width, height: height)
    panel.show(volume: volume, value: value)
  }
  private func dismissPanelLater() {
    guard !panel.isHidden, !UIAccessibility.isVoiceOverRunning else { return }
    if panel.isVolume { panel.update(volume.value) }
    hideTask?.cancel()
    hideTask = Task { [weak self] in
      try? await Task.sleep(for: .milliseconds(900))
      guard !Task.isCancelled else { return }
      self?.panel.hide()
    }
  }
  @objc private func dismissPanel() {
    hideTask?.cancel()
    panel.hide()
  }
  @objc private func adjustBrightness() -> Bool {
    guard playback.canInteract, host.window?.screen === UIScreen.main else { return false }
    hideTask?.cancel()
    endpoints.removeAll()
    showPanel(volume: false, value: brightness.value)
    UIAccessibility.post(notification: .layoutChanged, argument: panel.slider)
    return true
  }
  @objc private func adjustVolume() -> Bool {
    guard playback.canInteract else { return false }
    hideTask?.cancel()
    endpoints.removeAll()
    showPanel(volume: true, value: volume.value)
    UIAccessibility.post(notification: .layoutChanged, argument: panel.slider)
    return true
  }
  func setDeviceVolume(_ value: Double) { volume.set(value) }
  func setDeviceMuted(_ muted: Bool) { volume.setMuted(muted) }
  @objc private func goBack() {
    suspend()
    close()
  }
  private func refreshMaterials() {
    for material in [backMaterial, preview] {
      if !material.isHidden { material.present(true, animated: false) }
    }
  }
  func dispose() {
    suspend()
    volume.dispose()
    host.removeGestureRecognizer(pan)
    host.removeGestureRecognizer(outsideTap)
    accessibilityObservers.forEach(NotificationCenter.default.removeObserver)
    accessibilityObservers = []
  }
}
