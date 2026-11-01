// swift-tools-version: 6.0
import PackageDescription

let package = Package(
  name: "NavigatorCore", platforms: [.macOS(.v13), .iOS(.v17)],
  products: [.library(name: "NavigatorCore", targets: ["NavigatorCore"])],
  targets: [
    .target(name: "NavigatorCore", path: "Navigator/Core"),
    .target(
      name: "NavigatorTransport", dependencies: ["NavigatorCore"], path: "Navigator/Transport",
      swiftSettings: [.swiftLanguageMode(.v5)]),
    .testTarget(
      name: "NavigatorTransportTests", dependencies: ["NavigatorCore", "NavigatorTransport"],
      path: "Tests/NavigatorTransportTests"),
    .testTarget(
      name: "NavigatorCoreTests", dependencies: ["NavigatorCore"], path: "Tests/NavigatorCoreTests"),
  ])
