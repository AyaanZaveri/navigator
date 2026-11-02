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
    app.webViews.buttons["Pause fixture"].tap()
    assertGlassSamplesNativeVideo(app)
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
      thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.82, dy: 0.78)))
    let slider = app.descendants(matching: .any)["native-side-slider"]
    XCTAssertTrue(
      app.webViews.staticTexts["Video volume adjusted"].waitForExistence(timeout: 3),
      app.debugDescription)
    // Open a persistent bar for direct touch and mute checks, so the Android
    // 900 ms swipe-HUD dismissal does not race XCTest's accessibility polling.
    app.buttons["native-player-volume"].tap()
    if !slider.exists { app.buttons["native-player-volume"].tap() }
    XCTAssertTrue(slider.waitForExistence(timeout: 3))
    XCTAssertEqual(slider.label, "Video volume")
    XCTAssertGreaterThan(slider.frame.height, slider.frame.width * 3)
    let expectedWidth: CGFloat = app.frame.width >= 600 && app.frame.height >= 600 ? 72.8 : 56
    XCTAssertEqual(slider.frame.width, expectedWidth, accuracy: 1)
    let barStart = slider.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
    barStart.press(
      forDuration: 0.05,
      thenDragTo: slider.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.7)))
    // Explicitly reopen after the short-lived bar gesture, then tap its icon.
    app.buttons["native-player-volume"].tap()
    if !slider.exists { app.buttons["native-player-volume"].tap() }
    slider.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.09)).tap()
    XCTAssertTrue(app.webViews.staticTexts["Video muted"].waitForExistence(timeout: 3))
    app.buttons["native-player-volume"].tap()
    if !slider.exists { app.buttons["native-player-volume"].tap() }
    slider.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.09)).tap()
    XCTAssertTrue(app.webViews.staticTexts["Video audible"].waitForExistence(timeout: 3))
    app.buttons["native-player-volume"].tap()
    if !slider.exists { app.buttons["native-player-volume"].tap() }
    let volumeShot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    volumeShot.name = "Android-style volume bar"
    volumeShot.lifetime = .keepAlways
    add(volumeShot)
    let brightness = app.buttons["native-player-brightness"]
    XCTAssertTrue(brightness.exists)
    brightness.tap()
    XCTAssertTrue(slider.waitForExistence(timeout: 3))
    XCTAssertEqual(slider.label, "Brightness")
    let brightnessShot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    brightnessShot.name = "Android-style brightness bar"
    brightnessShot.lifetime = .keepAlways
    add(brightnessShot)
    // Both families must recover acknowledged native geometry after resizing.
    XCUIDevice.shared.orientation = .portrait
    XCUIDevice.shared.orientation = .landscapeLeft
    let back = app.buttons["native-player-back"]
    XCTAssertTrue(back.waitForExistence(timeout: 5))
    back.tap()
    XCTAssertTrue(app.webViews.staticTexts["Player closed"].waitForExistence(timeout: 5))
  }
  func testBackDragOutsideCancelsBeforeAProperTap() {
    let app = XCUIApplication()
    app.launchArguments = ["-server", "https://localhost:9443"]
    app.launch()
    XCTAssertTrue(app.webViews.buttons["Play fixture"].waitForExistence(timeout: 25))
    app.webViews.buttons["Play fixture"].tap()
    XCTAssertTrue(app.webViews.staticTexts["Native playback ready"].waitForExistence(timeout: 20))
    app.webViews.buttons["Pause fixture"].tap()
    let back = app.buttons["native-player-back"]
    XCTAssertTrue(back.waitForExistence(timeout: 5))
    let start = back.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
    let outside = back.coordinate(withNormalizedOffset: CGVector(dx: 1, dy: 0.5)).withOffset(
      CGVector(dx: 8, dy: 0))
    start.press(forDuration: 0.4, thenDragTo: outside)
    XCTAssertFalse(
      app.webViews.staticTexts["Player closed"].exists,
      "Releasing outside the actual circular button must cancel Back")
    XCTAssertTrue(back.exists)
    if back.exists { back.tap() }
    XCTAssertTrue(app.webViews.staticTexts["Player closed"].waitForExistence(timeout: 5))
  }
  func testMediaCardLongPressDoesNotPreviewOrNavigate() {
    let app = XCUIApplication()
    app.launchArguments = ["-server", "https://localhost:9443"]
    app.launch()
    let card = app.webViews.links["Media card fixture"]
    XCTAssertTrue(card.waitForExistence(timeout: 25))
    card.press(forDuration: 1.2)
    XCTAssertFalse(app.menus.firstMatch.exists)
    app.webViews.buttons["Check link previews"].tap()
    XCTAssertTrue(
      app.webViews.staticTexts["No link preview requested"].waitForExistence(timeout: 5))
    card.tap()
    XCTAssertTrue(app.webViews.staticTexts["Media card opened"].waitForExistence(timeout: 5))
  }
  private func assertGlassSamplesNativeVideo(_ app: XCUIApplication) {
    let back = app.buttons["native-player-back"]
    XCTAssertTrue(back.waitForExistence(timeout: 5))
    // Screenshot CGImages can retain portrait pixel storage with an EXIF
    // rotation. Normalize UIImage orientation into the accepted window geometry
    // before sampling points; sampling the raw CGImage hits unrelated content.
    let text = app.webViews.staticTexts.matching(
      NSPredicate(format: "label BEGINSWITH %@", "Geometry: ")
    ).firstMatch.label
    guard
      let geometry = try? JSONSerialization.jsonObject(
        with: Data(text.dropFirst("Geometry: ".count).utf8)) as? [String: Double],
      let width = geometry["w"], let height = geometry["h"], let x = geometry["x"],
      let y = geometry["y"], let w = geometry["width"], let h = geometry["height"]
    else { return XCTFail("Missing accepted viewport geometry: \(text)") }
    let viewport = CGSize(width: width, height: height)
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    format.opaque = true
    let snapshot = XCUIScreen.main.screenshot().image
    guard
      let image = UIGraphicsImageRenderer(size: viewport, format: format).image(actions: { _ in
        snapshot.draw(in: CGRect(origin: .zero, size: viewport))
      }).cgImage
    else { return XCTFail("No normalized screenshot") }
    let nativeFrame = CGRect(x: x, y: y, width: w, height: h)
    let scaleX = CGFloat(image.width) / width
    let scaleY = CGFloat(image.height) / height
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
    let sampleY = nativeFrame.maxY - 9
    let inside = stride(from: 12, through: 32, by: 2).map {
      green(at: CGPoint(x: nativeFrame.minX + CGFloat($0), y: sampleY))
    }
    let outside = stride(from: 16, through: 80, by: 2).map {
      green(at: CGPoint(x: nativeFrame.maxX + CGFloat($0), y: sampleY))
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
