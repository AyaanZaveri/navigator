import MediaPlayer
import UIKit

/// A native backing surface, never a captured frame of the movie. Keep this
/// view and every ancestor at alpha 1 so UIKit can composite the live backdrop.
@MainActor final class PlayerMaterial: UIView {
  private let blur = UIVisualEffectView()
  private var revision = 0
  let interactive: Bool
  private let usesMaterial: Bool
  init(radius: CGFloat, interactive: Bool = false, usesMaterial: Bool = true) {
    self.usesMaterial = usesMaterial
    self.interactive = interactive
    super.init(frame: .zero)
    overrideUserInterfaceStyle = .dark
    layer.cornerRadius = radius
    layer.cornerCurve = .continuous
    clipsToBounds = true
    blur.layer.cornerRadius = radius
    blur.layer.cornerCurve = .continuous
    blur.clipsToBounds = true
    blur.frame = bounds
    blur.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    addSubview(blur)
    isHidden = true
  }
  required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
  var content: UIView { blur.contentView }
  func present(_ visible: Bool, animated: Bool = true) {
    if !visible && isHidden { return }
    if !usesMaterial {
      isHidden = !visible
      return
    }
    revision += 1
    let owner = revision
    let effect: UIVisualEffect?
    if UIAccessibility.isReduceTransparencyEnabled {
      backgroundColor = .secondarySystemBackground
      effect = nil
    } else {
      backgroundColor = .clear
      if #available(iOS 26.0, *) {
        let glass = UIGlassEffect(style: .regular)
        glass.isInteractive = interactive
        effect = glass
      } else {
        effect = UIBlurEffect(style: .systemMaterialDark)
      }
    }
    if visible { isHidden = false }
    let changes = { self.blur.effect = visible ? effect : nil }
    let finish: (Bool) -> Void = { [weak self] _ in
      guard let self, self.revision == owner else { return }
      self.isHidden = !visible
    }
    if animated && !UIAccessibility.isReduceMotionEnabled {
      UIView.animate(
        withDuration: 0.16, delay: 0, options: [.beginFromCurrentState, .allowUserInteraction],
        animations: changes, completion: finish)
    } else {
      changes()
      finish(true)
    }
  }
}

@MainActor final class PlaybackBrightness {
  private static weak var owner: PlaybackBrightness?
  private var restoration: BrightnessRestoration?
  private var observation: NSObjectProtocol?
  init() {
    observation = NotificationCenter.default.addObserver(
      forName: UIScreen.brightnessDidChangeNotification, object: UIScreen.main, queue: .main
    ) { [weak self] _ in
      Task { @MainActor in self?.restoration?.observe(Double(UIScreen.main.brightness)) }
    }
  }
  var value: Double { Double(UIScreen.main.brightness) }
  func set(_ value: Double) {
    if Self.owner !== self {
      Self.owner?.release()
      Self.owner = self
      restoration = BrightnessRestoration(current: self.value)
    }
    guard let next = restoration?.apply(value, current: self.value) else { return }
    UIScreen.main.brightness = next
  }
  func release() {
    guard Self.owner === self else { return }
    if let restoration { UIScreen.main.brightness = restoration.restore(current: value) }
    restoration = nil
    Self.owner = nil
  }
  deinit { if let observation { NotificationCenter.default.removeObserver(observation) } }
}

/// The same transparent bar, track, Lucide icons, and relative drag as Android.
/// Only its geometry grows on a roomy iPad; there is no panel or material.
@MainActor final class PlayerSidePanel: UIControl, UIContextMenuInteractionDelegate {
  private let track = CALayer()
  private let fill = CALayer()
  private let icon = UIImageView()
  private var drag: VerticalSliderDrag?
  private var iconPress = false
  private var value = 0.0
  private var previousBounds = CGRect.zero
  var scale: CGFloat = 1
  var changed: (Double) -> Void = { _ in }
  var began: () -> Void = {}
  var released: () -> Void = {}
  var mute: () -> Void = {}
  var deviceVolume: () -> Void = {}
  private(set) var isVolume = false
  var slider: UIControl { self }
  override init(frame: CGRect) {
    super.init(frame: frame)
    backgroundColor = .clear
    isOpaque = false
    track.backgroundColor = UIColor.white.withAlphaComponent(0.2).cgColor
    fill.backgroundColor = UIColor.white.cgColor
    layer.addSublayer(track)
    layer.addSublayer(fill)
    icon.tintColor = .white
    icon.contentMode = .scaleAspectFit
    addSubview(icon)
    isAccessibilityElement = true
    accessibilityTraits = .adjustable
    accessibilityIdentifier = "native-side-slider"
    addInteraction(UIContextMenuInteraction(delegate: self))
    isHidden = true
  }
  required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
  override func layoutSubviews() {
    super.layoutSubviews()
    guard bounds != previousBounds else { return }
    previousBounds = bounds
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    track.frame = CGRect(
      x: bounds.midX - 3 * scale, y: 44 * scale, width: 6 * scale,
      height: max(1, bounds.height - 60 * scale))
    track.cornerRadius = 3 * scale
    fill.cornerRadius = 3 * scale
    icon.frame = CGRect(
      x: bounds.midX - 9 * scale, y: 13 * scale, width: 18 * scale, height: 18 * scale)
    fill.frame = fillFrame
    fill.removeAllAnimations()
    CATransaction.commit()
  }
  private var fillFrame: CGRect {
    let bottom = bounds.height - 16 * scale
    let height = max(1, bounds.height - 60 * scale) * value
    return CGRect(x: bounds.midX - 3 * scale, y: bottom - height, width: 6 * scale, height: height)
  }
  func show(volume: Bool, value: Double) {
    let reset = isHidden || isVolume != volume
    isVolume = volume
    accessibilityLabel = volume ? "Video volume" : "Brightness"
    accessibilityHint = volume ? "The top icon toggles mute. Hold it for device volume." : nil
    accessibilityCustomActions =
      volume
      ? [
        UIAccessibilityCustomAction(
          name: "Toggle video mute", target: self, selector: #selector(toggleMute)),
        UIAccessibilityCustomAction(
          name: "Device volume", target: self, selector: #selector(openDeviceVolume)),
      ] : nil
    isHidden = false
    layoutIfNeeded()
    update(value, animated: !reset)
  }
  func update(_ next: Double, animated: Bool = true) {
    value = max(0, min(1, next))
    accessibilityValue = "\(Int((value * 100).rounded()))%"
    let name =
      !isVolume
      ? "PlayerSun"
      : value <= 0
        ? "PlayerVolumeMuted"
        : value < 0.34
          ? "PlayerVolumeLow" : value < 0.67 ? "PlayerVolumeMedium" : "PlayerVolumeHigh"
    icon.image = UIImage(named: name)
    let fromBounds = fill.presentation()?.bounds ?? fill.bounds
    let fromPosition = fill.presentation()?.position ?? fill.position
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    fill.frame = fillFrame
    CATransaction.commit()
    if animated && !UIAccessibility.isReduceMotionEnabled {
      for (key, from, to) in [
        ("bounds", NSValue(cgRect: fromBounds), NSValue(cgRect: fill.bounds)),
        ("position", NSValue(cgPoint: fromPosition), NSValue(cgPoint: fill.position)),
      ] {
        let animation = CABasicAnimation(keyPath: key)
        animation.fromValue = from
        animation.toValue = to
        animation.duration = 0.1
        animation.timingFunction = CAMediaTimingFunction(controlPoints: 0.23, 1, 0.32, 1)
        fill.add(animation, forKey: key)
      }
    } else {
      fill.removeAllAnimations()
    }
  }
  func hide() {
    fill.removeAllAnimations()
    isHidden = true
    drag = nil
    iconPress = false
  }
  override func beginTracking(_ touch: UITouch, with event: UIEvent?) -> Bool {
    began()
    let point = touch.location(in: self)
    iconPress = isVolume && point.y < 44 * scale
    drag =
      iconPress
      ? nil : VerticalSliderDrag(value: value, y: point.y, span: bounds.height - 60 * scale)
    return true
  }
  override func continueTracking(_ touch: UITouch, with event: UIEvent?) -> Bool {
    if let next = drag?.move(y: touch.location(in: self).y) { apply(next) }
    return true
  }
  override func endTracking(_ touch: UITouch?, with event: UIEvent?) {
    if let touch {
      if iconPress && touch.location(in: self).y < 44 * scale {
        mute()
      } else if let next = drag?.move(y: touch.location(in: self).y) {
        apply(next)
      }
    }
    drag = nil
    iconPress = false
    released()
  }
  override func cancelTracking(with event: UIEvent?) {
    drag = nil
    iconPress = false
    released()
  }
  private func apply(_ next: Double) {
    update(next)
    changed(next)
  }
  override func accessibilityIncrement() {
    began()
    apply(min(1, value + 0.05))
    released()
  }
  override func accessibilityDecrement() {
    began()
    apply(max(0, value - 0.05))
    released()
  }
  override func accessibilityActivate() -> Bool { isVolume ? toggleMute() : false }
  @objc private func toggleMute() -> Bool {
    began()
    mute()
    released()
    return true
  }
  @objc private func openDeviceVolume() -> Bool {
    began()
    deviceVolume()
    return true
  }
  func contextMenuInteraction(
    _ interaction: UIContextMenuInteraction, configurationForMenuAtLocation location: CGPoint
  ) -> UIContextMenuConfiguration? {
    guard isVolume, location.y < 44 * scale else { return nil }
    began()
    return UIContextMenuConfiguration(identifier: nil, previewProvider: nil) { [weak self] _ in
      UIMenu(children: [
        UIAction(title: "Device volume", image: UIImage(systemName: "speaker.wave.2")) { _ in
          self?.deviceVolume()
        }
      ])
    }
  }
}

/// Apple's public device-volume slider stays separate from the swipe HUD.
@MainActor final class DeviceVolumeViewController: UIViewController {
  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .secondarySystemBackground
    overrideUserInterfaceStyle = .dark
    preferredContentSize = CGSize(width: 300, height: 200)
    let label = UILabel()
    label.text = "Device volume"
    label.font = .preferredFont(forTextStyle: .headline)
    label.adjustsFontForContentSizeCategory = true
    let volume = MPVolumeView()
    volume.showsRouteButton = false
    let done = UIButton(type: .system)
    done.setTitle("Done", for: .normal)
    done.addTarget(self, action: #selector(close), for: .touchUpInside)
    done.heightAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
    let stack = UIStackView(arrangedSubviews: [label, volume, done])
    stack.axis = .vertical
    stack.spacing = 12
    stack.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(stack)
    NSLayoutConstraint.activate([
      stack.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 24),
      stack.trailingAnchor.constraint(
        equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -24),
      stack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 20),
      volume.heightAnchor.constraint(equalToConstant: 44),
    ])
  }
  @objc private func close() { dismiss(animated: true) }
}

/// Native overlays only intercept their actual controls, leaving the movie and
/// shared WebView controls available for taps and native gesture recognition.
@MainActor class PlayerPanelBase: UIView {
  override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    let result = super.hitTest(point, with: event)
    return result === self ? nil : result
  }
}
