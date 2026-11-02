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
    app.webViews.buttons["Preview fixture"].tap()
    XCTAssertTrue(app.webViews.staticTexts["Native preview verified"].waitForExistence(timeout: 15))
    let close = app.webViews.buttons["Close fixture"]
    XCTAssertTrue(close.exists)
    close.tap()
    XCTAssertTrue(app.webViews.staticTexts["Player closed"].waitForExistence(timeout: 5))
  }
  private func assertResumedSceneIsGreen(_ app: XCUIApplication) {
    guard let image = app.screenshot().image.cgImage else {
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
