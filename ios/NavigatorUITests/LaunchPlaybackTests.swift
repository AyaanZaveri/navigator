import XCTest
final class LaunchPlaybackTests:XCTestCase {
    func testNativePlaybackStartsAtResumeAndUsesHeaderGateway(){
        let app=XCUIApplication();app.launchArguments=["-server","https://localhost:9443"]
        app.launch()
        let play=app.webViews.buttons["Play fixture"]
        XCTAssertTrue(play.waitForExistence(timeout:25));play.tap()
        let ready=app.webViews.staticTexts["Native playback ready"]
        XCTAssertTrue(ready.waitForExistence(timeout:20))
        let resumed=app.webViews.staticTexts["Resume position verified"]
        XCTAssertTrue(resumed.waitForExistence(timeout:5))
        let close=app.webViews.buttons["Close fixture"]
        XCTAssertTrue(close.exists);close.tap()
        XCTAssertTrue(app.webViews.staticTexts["Player closed"].waitForExistence(timeout:5))
    }
}
