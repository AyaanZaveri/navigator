import UIKit
import XCTest

final class LaunchPlaybackTests: XCTestCase {
  func testNativePlaybackStartsAtResumeAndUsesHeaderGateway() {
    let app = XCUIApplication()
    app.launchArguments = ["-server", "https://localhost:9443"]
    app.launch()
    let play = app.webViews.buttons["Play fixture"]
    XCTAssertTrue(play.waitForExistence(timeout: 25))
    XCTAssertTrue(play.isHittable)
    play.tap()
    let ready = app.webViews.staticTexts["Native playback ready"]
    guard ready.waitForExistence(timeout: 20) else {
      XCTFail(app.debugDescription)
      return
    }
    let resumed = app.webViews.staticTexts["Resume position verified"]
    XCTAssertTrue(resumed.waitForExistence(timeout: 5))
    assertResumedSceneIsGreen(app)
    assertGlassSamplesNativeVideo(app)
    app.webViews.buttons["Pause fixture"].tap()
    app.webViews.buttons["Preview fixture"].tap()
    XCTAssertTrue(app.webViews.staticTexts["Native preview verified"].waitForExistence(timeout: 15))
    app.webViews.buttons["Repeat cached preview"].tap()
    XCTAssertTrue(app.webViews.staticTexts["Cached preview immediate"].waitForExistence(timeout: 3))
    let close = app.webViews.buttons["Close fixture"]
    XCTAssertTrue(close.exists)
    close.tap()
    XCTAssertTrue(app.webViews.staticTexts["Player closed"].waitForExistence(timeout: 5))
  }
  func testNativeGesturesVolumeAndBack() {
    let app = XCUIApplication()
    app.launchArguments = ["-server", "https://localhost:9443"]
    app.launch()
    let play = app.webViews.buttons["Play fixture"]
    XCTAssertTrue(play.waitForExistence(timeout: 25))
    play.tap()
    XCTAssertTrue(app.webViews.staticTexts["Native playback ready"].waitForExistence(timeout: 20))
    app.webViews.buttons["Pause fixture"].tap()
    XCTAssertTrue(app.webViews.staticTexts["Playback paused"].waitForExistence(timeout: 5))
    let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.48, dy: 0.56))
    let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.66, dy: 0.56))
    start.press(forDuration: 0.05, thenDragTo: end)
    XCTAssertTrue(
      app.webViews.staticTexts["Surface scrub committed"].waitForExistence(timeout: 5),
      app.debugDescription)
    XCTAssertTrue(
      app.webViews.staticTexts["Playback paused"].exists,
      "A paused movie must stay paused after scrubbing")
    // Native side swipes and explicit sliders share the same video gain.
    let right = app.coordinate(withNormalizedOffset: CGVector(dx: 0.82, dy: 0.58))
    right.press(
      forDuration: 0.05,
      thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.82, dy: 0.38)))
    let slider = app.sliders["native-side-slider"]
    XCTAssertTrue(slider.waitForExistence(timeout: 3), app.debugDescription)
    // The swipe HUD intentionally dismisses quickly. Open the persistent
    // panel for a user-driven slider interaction, independently of test speed.
    app.buttons["native-player-volume"].tap()
    if !slider.exists { app.buttons["native-player-volume"].tap() }
    XCTAssertTrue(slider.waitForExistence(timeout: 3))
    slider.adjust(toNormalizedSliderPosition: 0.3)
    XCTAssertTrue(app.staticTexts["Video volume"].exists)
    XCTAssertTrue(app.staticTexts["Device volume"].exists)
    let brightness = app.buttons["native-player-brightness"]
    XCTAssertTrue(brightness.exists)
    brightness.tap()
    XCTAssertTrue(app.sliders["Brightness"].waitForExistence(timeout: 3))
    // Both families must recover acknowledged native geometry after resizing.
    XCUIDevice.shared.orientation = .portrait
    XCUIDevice.shared.orientation = .landscapeLeft
    let back = app.buttons["native-player-back"]
    XCTAssertTrue(back.waitForExistence(timeout: 5))
    back.tap()
    XCTAssertTrue(app.webViews.staticTexts["Player closed"].waitForExistence(timeout: 5))
  }
  private func assertGlassSamplesNativeVideo(_ app: XCUIApplication) {
    let back = app.buttons["native-player-back"]
    XCTAssertTrue(back.waitForExistence(timeout: 5))
    guard let image = XCUIScreen.main.screenshot().image.cgImage else {
      return XCTFail("No glass screenshot")
    }
    let scaleX = CGFloat(image.width) / app.frame.width
    let scaleY = CGFloat(image.height) / app.frame.height
    func green(at point: CGPoint) -> Int {
      let box = CGRect(x: point.x * scaleX, y: point.y * scaleY, width: 1, height: 1)
      guard let sample = image.cropping(to: box) else {
        XCTFail("Glass sample outside screen")
        return 0
      }
      var pixel = [UInt8](repeating: 0, count: 4)
      pixel.withUnsafeMutableBytes { bytes in
        let context = CGContext(
          data: bytes.baseAddress, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4,
          space: CGColorSpaceCreateDeviceRGB(),
          bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        context.draw(sample, in: CGRect(x: 0, y: 0, width: 1, height: 1))
      }
      return Int(pixel[1])
    }
    // The movie has alternating black/green stripes across its top. Glass
    // must smooth their contrast; a transparent or opaque backing cannot pass.
    let y = back.frame.maxY - 9
    let inside = stride(from: 12, through: 32, by: 2).map {
      green(at: CGPoint(x: back.frame.minX + CGFloat($0), y: y))
    }
    let outside = stride(from: 16, through: 80, by: 2).map {
      green(at: CGPoint(x: back.frame.maxX + CGFloat($0), y: y))
    }
    let rawContrast = outside.max()! - outside.min()!
    let glassContrast = inside.max()! - inside.min()!
    XCTAssertGreaterThan(rawContrast, 160, "Movie stripe fixture must be visible: \(outside)")
    XCTAssertLessThan(
      Double(glassContrast), Double(rawContrast) * 0.8,
      "Glass must blur the live VLC stripes: \(inside)")
    XCTAssertGreaterThan(
      inside.reduce(0, +) / inside.count, 10,
      "Glass must transmit video, not be an opaque dark backing")
    let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    attachment.name = "Native Liquid Glass over VLC"
    attachment.lifetime = .keepAlways
    add(attachment)
  }

  private func assertResumedSceneIsGreen(_ app: XCUIApplication) {
    guard let image = XCUIScreen.main.screenshot().image.cgImage else {
      XCTFail("No rendered movie frame")
      return
    }
    var pixel = [UInt8](repeating: 0, count: 4)
    pixel.withUnsafeMutableBytes { bytes in
      guard
        let context = CGContext(
          data: bytes.baseAddress, width: 1, height: 1, bitsPerComponent: 8,
          bytesPerRow: 4, space: CGColorSpaceCreateDeviceRGB(),
          bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
      else {
        XCTFail("No pixel context")
        return
      }
      context.interpolationQuality = .none
      context.draw(
        image,
        in: CGRect(
          x: 0.5 - CGFloat(image.width) / 2, y: 0.5 - CGFloat(image.height) / 2,
          width: CGFloat(image.width), height: CGFloat(image.height)))
    }
    XCTAssertGreaterThan(
      Int(pixel[1]), 180, "Resume must show the green scene, not the red opening frame: \(pixel)")
    XCTAssertLessThan(Int(pixel[0]), 60)
    XCTAssertLessThan(Int(pixel[2]), 60)
  }
}
