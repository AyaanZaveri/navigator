import XCTest
final class LaunchPlaybackTests:XCTestCase {
    func testNativePlaybackStartsAtResumeAndUsesHeaderGateway(){
        let app=XCUIApplication();app.launchArguments=["-server","https://localhost:9443"]
        app.launch()
        let play=app.webViews.buttons["Play fixture"]
        XCTAssertTrue(play.waitForExistence(timeout:25));XCTAssertTrue(play.isHittable);play.tap()
        let ready=app.webViews.staticTexts["Native playback ready"]
        guard ready.waitForExistence(timeout:20) else { XCTFail(app.debugDescription);return }
        let resumed=app.webViews.staticTexts["Resume position verified"]
        XCTAssertTrue(resumed.waitForExistence(timeout:5))
        app.webViews.buttons["Preview fixture"].tap()
        XCTAssertTrue(app.webViews.staticTexts["Native preview verified"].waitForExistence(timeout:15))
        let close=app.webViews.buttons["Close fixture"]
        XCTAssertTrue(close.exists);close.tap()
        XCTAssertTrue(app.webViews.staticTexts["Player closed"].waitForExistence(timeout:5))
    }
}
