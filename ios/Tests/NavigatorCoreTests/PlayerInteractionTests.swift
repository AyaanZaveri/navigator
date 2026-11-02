import CoreGraphics
import Foundation
import Testing

@testable import NavigatorCore

@Test func directionalLockAndFineScrubbingDoNotJump() {
  var gesture = PlayerGesture(
    point: CGPoint(x: 300, y: 400), size: CGSize(width: 1000, height: 500), position: 200,
    duration: 1000)
  gesture.move(CGPoint(x: 305, y: 405))
  #expect(gesture.mode == .undecided)
  gesture.move(CGPoint(x: 320, y: 400))
  #expect(gesture.mode == .scrub)
  let coarse = gesture.target
  gesture.move(CGPoint(x: 320, y: 50))
  #expect(gesture.target == coarse)
  gesture.move(CGPoint(x: 340, y: 50))
  #expect(gesture.target > coarse)
  #expect(gesture.target - coarse < 1)
  #expect(gesture.mode == .scrub)
  gesture.move(CGPoint(x: -10000, y: 50))
  #expect(gesture.target == 0)
  gesture.move(CGPoint(x: 100000, y: 500))
  #expect(gesture.target == 1000)
}

@Test func sideGesturesLockAndClamp() {
  var left = PlayerGesture(
    point: CGPoint(x: 80, y: 250), size: CGSize(width: 1000, height: 500), position: 100,
    duration: 1000)
  left.move(CGPoint(x: 82, y: 230))
  #expect(left.mode == .brightness)
  left.move(CGPoint(x: 600, y: 230))
  #expect(left.mode == .brightness)
  #expect(left.target == 100)
  #expect(left.sideValue(initial: 0.5, point: CGPoint(x: 80, y: -1000)) == 1)
  #expect(left.sideValue(initial: 0.5, point: CGPoint(x: 80, y: 2000)) == 0)
  var right = PlayerGesture(
    point: CGPoint(x: 900, y: 250), size: CGSize(width: 1000, height: 500), position: 100,
    duration: 1000)
  right.move(CGPoint(x: 900, y: 270))
  #expect(right.mode == .volume)
  var middle = PlayerGesture(
    point: CGPoint(x: 500, y: 250), size: CGSize(width: 1000, height: 500), position: 100,
    duration: 1000)
  middle.move(CGPoint(x: 500, y: 270))
  #expect(middle.mode == .undecided)
}

@Test func brightnessRestoresWithoutOverwritingControlCenterChanges() {
  var state = BrightnessRestoration(current: 0.4)
  #expect(state.apply(0.8, current: 0.4) == 0.8)
  state.observe(0.8)
  #expect(state.restore(current: 0.8) == 0.4)
  state.observe(0.6)
  #expect(state.restore(current: 0.6) == 0.6)
  _ = state.apply(0.9, current: 0.6)
  #expect(state.restore(current: 0.9) == 0.6)
  #expect(state.restore(current: 0.2) == 0.2)
}

@Test func layoutRejectsUnboundedGeometryAndIsSessionBound() throws {
  let body: [String: Any] = [
    "width": 1000, "height": 500, "blocked": false, "controlsVisible": true,
    "exclusions": [["x": 0, "y": 400, "width": 1000, "height": 100]],
    "close": ["x": 16, "y": 16, "width": 44, "height": 44],
  ]
  let layout = try PlayerLayout(body)
  #expect(layout.matches(CGRect(x: 0, y: 0, width: 1000, height: 500)))
  #expect(!layout.matches(CGRect(x: 0, y: 0, width: 500, height: 1000)))
  #expect(layout.exclusions[0].contains(CGPoint(x: 500, y: 450)))
  var bad = body
  bad["width"] = true
  #expect(throws: PolicyError.self) { try PlayerLayout(bad) }
  bad = body
  bad["exclusions"] = Array(repeating: ["x": 0, "y": 0, "width": 1, "height": 1], count: 65)
  #expect(throws: PolicyError.self) { try PlayerLayout(bad) }
  #expect(throws: PolicyError.self) { try BridgeCommand(["type": "player-layout"]) }
  #expect(try BridgeCommand(["type": "player-layout", "session": "one"]).session == "one")
}
