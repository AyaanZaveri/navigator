import MediaPlayer
import UIKit

/// A native backing surface, never a captured frame of the movie. Keep this
/// view and every ancestor at alpha 1 so UIKit can composite the live backdrop.
@MainActor final class PlayerMaterial: UIView {
  private let blur = UIVisualEffectView()
  private var revision = 0
  let interactive: Bool
  init(radius: CGFloat, interactive: Bool = false) {
    self.interactive = interactive
    super.init(frame: .zero)
    overrideUserInterfaceStyle = .dark
    layer.cornerRadius = radius
    layer.cornerCurve = .continuous
    clipsToBounds = true
    blur.frame = bounds
    blur.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    addSubview(blur)
    isHidden = true
  }
  required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
  var content: UIView { blur.contentView }
  func present(_ visible: Bool, animated: Bool = true) {
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

@MainActor final class PlayerSidePanel: PlayerPanelBase {
  let material = PlayerMaterial(radius: 24)
  let slider = UISlider()
  private let title = UILabel()
  private let valueLabel = UILabel()
  private let deviceLabel = UILabel()
  private let deviceVolume = MPVolumeView()
  var changed: (Double) -> Void = { _ in }
  private(set) var isVolume = false
  override init(frame: CGRect) {
    super.init(frame: frame)
    overrideUserInterfaceStyle = .dark
    material.frame = bounds
    material.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    addSubview(material)
    let stack = UIStackView(arrangedSubviews: [
      title, slider, valueLabel, deviceLabel, deviceVolume,
    ])
    stack.axis = .vertical
    stack.spacing = 8
    stack.translatesAutoresizingMaskIntoConstraints = false
    let scroll = UIScrollView()
    scroll.translatesAutoresizingMaskIntoConstraints = false
    material.content.addSubview(scroll)
    scroll.addSubview(stack)
    NSLayoutConstraint.activate([
      scroll.leadingAnchor.constraint(equalTo: material.content.leadingAnchor),
      scroll.trailingAnchor.constraint(equalTo: material.content.trailingAnchor),
      scroll.topAnchor.constraint(equalTo: material.content.topAnchor),
      scroll.bottomAnchor.constraint(equalTo: material.content.bottomAnchor),
      stack.leadingAnchor.constraint(
        equalTo: scroll.contentLayoutGuide.leadingAnchor, constant: 20),
      stack.trailingAnchor.constraint(
        equalTo: scroll.contentLayoutGuide.trailingAnchor, constant: -20),
      stack.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: 20),
      stack.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -20),
      stack.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor, constant: -40),
      slider.heightAnchor.constraint(greaterThanOrEqualToConstant: 44),
      deviceVolume.heightAnchor.constraint(equalToConstant: 44),
    ])
    title.font = .preferredFont(forTextStyle: .headline)
    valueLabel.font = .preferredFont(forTextStyle: .subheadline)
    valueLabel.textColor = .secondaryLabel
    deviceLabel.font = .preferredFont(forTextStyle: .subheadline)
    deviceLabel.text = "Device volume"
    for label in [title, valueLabel, deviceLabel] {
      label.adjustsFontForContentSizeCategory = true
      label.numberOfLines = 0
    }
    slider.minimumValue = 0
    slider.maximumValue = 1
    slider.addTarget(self, action: #selector(slide), for: .valueChanged)
    slider.accessibilityIdentifier = "native-side-slider"
    deviceVolume.showsRouteButton = false
    isHidden = true
  }
  required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
  func show(volume: Bool, value: Double) {
    isVolume = volume
    title.text = volume ? "Video volume" : "Brightness"
    slider.accessibilityLabel = title.text
    deviceLabel.isHidden = !volume
    deviceVolume.isHidden = !volume
    update(value)
    isHidden = false
    material.present(true)
  }
  func update(_ value: Double) {
    slider.value = Float(value)
    let text = "\(Int((value * 100).rounded()))%"
    valueLabel.text = text
    slider.accessibilityValue = text
  }
  func hide() {
    material.present(false, animated: false)
    isHidden = true
  }
  @objc private func slide() {
    let value = Double(slider.value)
    update(value)
    changed(value)
  }
}

/// Native overlays only intercept their actual controls, leaving the movie and
/// shared WebView controls available for taps and native gesture recognition.
@MainActor class PlayerPanelBase: UIView {
  override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    let result = super.hitTest(point, with: event)
    return result === self ? nil : result
  }
}
