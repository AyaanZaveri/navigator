import CoreFoundation
import CoreGraphics
import Foundation

/// A press belongs to the visible circle, not UIKit's expanded release region.
public struct CircularButtonPress {
  public private(set) var armed = false
  public init() {}
  public static func contains(_ point: CGPoint, in bounds: CGRect) -> Bool {
    let radius = min(bounds.width, bounds.height) / 2
    let dx = point.x - bounds.midX
    let dy = point.y - bounds.midY
    return radius > 0 && dx * dx + dy * dy <= radius * radius
  }
  public mutating func begin(_ point: CGPoint, in bounds: CGRect) {
    armed = Self.contains(point, in: bounds)
  }
  public mutating func move(_ point: CGPoint, in bounds: CGRect) {
    armed = armed && Self.contains(point, in: bounds)
  }
  public mutating func finish(_ point: CGPoint, in bounds: CGRect) -> Bool {
    let activate = armed && Self.contains(point, in: bounds)
    armed = false
    return activate
  }
  public mutating func cancel() { armed = false }
}

public struct DeviceMuteLevel {
  private var audible = 0.5
  public init(current: Double) { observe(current) }
  public mutating func observe(_ value: Double) {
    if value.isFinite && value > 0 { audible = min(1, value) }
  }
  public mutating func target(muted: Bool, current: Double) -> Double {
    observe(current)
    return muted ? 0 : current > 0 ? current : audible
  }
}

/// Native and Android scrubbing use incremental movement, so changing height
/// changes sensitivity without moving the target by itself.
public struct PlayerGesture: Sendable {
  public enum Mode: Sendable { case undecided, scrub, brightness, volume }
  public private(set) var mode: Mode = .undecided
  public private(set) var target: Double
  public private(set) var speed = 1.0
  private let origin: CGPoint
  private let size: CGSize
  private let duration: Double
  private var lastX: Double
  public init(point: CGPoint, size: CGSize, position: Double, duration: Double) {
    origin = point
    self.size = size
    self.duration = max(0, duration)
    target = max(0, min(position, self.duration))
    lastX = point.x
  }
  public mutating func move(_ point: CGPoint) {
    guard size.width > 0, size.height > 0 else { return }
    let dx = abs(point.x - origin.x)
    let dy = abs(point.y - origin.y)
    if mode == .undecided {
      if dx >= 12, dx > dy * 1.25 {
        mode = .scrub
      } else if dy >= 12, dy > dx * 1.25 {
        if origin.x < size.width / 3 {
          mode = .brightness
        } else if origin.x > size.width * 2 / 3 {
          mode = .volume
        }
      }
    }
    if mode == .scrub {
      let fraction = max(0, min(1, point.y / size.height))
      speed = 0.05 + 0.95 * fraction * fraction
      target = max(
        0, min(duration, target + (point.x - lastX) / size.width * min(duration, 600) * speed))
      lastX = point.x
    }
  }
  public func sideValue(initial: Double, point: CGPoint) -> Double {
    max(0, min(1, initial + (origin.y - point.y) / max(200, size.height * 0.5)))
  }
}

/// Brightness is screen-wide on iOS. An external change becomes the new
/// restoration baseline rather than being overwritten when playback ends.
public struct BrightnessRestoration: Sendable {
  public private(set) var baseline: Double
  public private(set) var applied: Double?
  public init(current: Double) { baseline = current }
  public mutating func apply(_ value: Double, current: Double) -> Double {
    observe(current)
    let next = max(0, min(1, value))
    applied = next
    return next
  }
  public mutating func observe(_ current: Double) {
    if let applied, abs(current - applied) > 0.002 { baseline = current }
  }
  public func restore(current: Double) -> Double {
    guard let applied, abs(current - applied) <= 0.002 else { return current }
    return baseline
  }
}

/// Android's relative slider drag: reverse immediately at a limit, with no
/// accumulated overshoot and no jump to the initial finger position.
public struct VerticalSliderDrag {
  public private(set) var value: Double
  private var lastY: Double
  private let span: Double
  public init(value: Double, y: Double, span: Double) {
    self.value = max(0, min(1, value))
    lastY = y
    self.span = max(1, span)
  }
  public mutating func move(y: Double) -> Double {
    value = max(0, min(1, value + (lastY - y) / span))
    lastY = y
    return value
  }
}

public struct SideControlMetrics {
  public let scale: Double
  public let width: Double
  public let height: Double
  public init(size: CGSize, safeArea: CGSize, isPad: Bool) {
    scale = isPad && min(size.width, size.height) >= 600 ? 1.3 : 1
    width = 56 * scale
    height = min(
      232 * scale, max(60 * scale + 1, Double(size.height - safeArea.height) - 40 * scale))
  }
}

public struct PlayerLayout {
  public let size: CGSize
  public let blocked: Bool
  public let controlsVisible: Bool
  public let exclusions: [CGRect]
  public let close: CGRect?
  public let preview: CGRect?
  public init(_ body: [String: Any]) throws {
    func number(_ value: Any?) throws -> Double {
      guard let value = value as? NSNumber, CFGetTypeID(value) != CFBooleanGetTypeID(),
        value.doubleValue.isFinite
      else { throw PolicyError.invalidMessage }
      return value.doubleValue
    }
    let width = try number(body["width"])
    let height = try number(body["height"])
    guard (1...16384).contains(width), (1...16384).contains(height),
      let blocked = body["blocked"] as? Bool, let visible = body["controlsVisible"] as? Bool,
      let raw = body["exclusions"] as? [[String: Any]], raw.count <= 64
    else { throw PolicyError.invalidMessage }
    let viewport = CGRect(x: 0, y: 0, width: width, height: height)
    func rect(_ value: Any?) throws -> CGRect? {
      guard let value, !(value is NSNull) else { return nil }
      guard let dict = value as? [String: Any] else { throw PolicyError.invalidMessage }
      let x = try number(dict["x"])
      let y = try number(dict["y"])
      let w = try number(dict["width"])
      let h = try number(dict["height"])
      guard abs(x) <= 32768, abs(y) <= 32768, w > 0, h > 0, w <= 16384, h <= 16384
      else { throw PolicyError.invalidMessage }
      let clipped = CGRect(x: x, y: y, width: w, height: h).intersection(viewport)
      return clipped.isNull || clipped.isEmpty ? nil : clipped
    }
    size = viewport.size
    self.blocked = blocked
    controlsVisible = visible
    exclusions = try raw.compactMap { try rect($0) }
    close = try rect(body["close"])
    preview = try rect(body["preview"])
  }
  public func matches(_ bounds: CGRect) -> Bool {
    abs(bounds.width - size.width) < 3 && abs(bounds.height - size.height) < 3
  }
}
