import Foundation
import Testing

@testable import NavigatorCore
@testable import NavigatorTransport

private final class StubProtocol: URLProtocol {
  override class func canInit(with request: URLRequest) -> Bool { request.url?.scheme == "https" }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
  override func startLoading() {
    let url = request.url!
    let body: Data
    let status: Int
    let headers: [String: String]
    if url.path == "/redirect" {
      let target = URL(string: "https://cdn.test/segment.ts")!
      let redirect = HTTPURLResponse(
        url: url, statusCode: 302, httpVersion: "HTTP/1.1",
        headerFields: ["Location": target.absoluteString])!
      client?.urlProtocol(
        self, wasRedirectedTo: URLRequest(url: target), redirectResponse: redirect)
      return
    } else if url.path == "/playlist.m3u8" {
      body = Data("#EXTM3U\n#EXTINF:5,\nhttps://cdn.test/segment.ts\n".utf8)
      status = 200
      headers = ["Content-Type": "application/vnd.apple.mpegurl"]
    } else if url.path == "/segment.ts" {
      guard request.value(forHTTPHeaderField: "Authorization") == nil else {
        client?.urlProtocol(self, didFailWithError: URLError(.userAuthenticationRequired))
        return
      }
      body = Data([9, 8, 7])
      status = 200
      headers = ["Content-Type": "video/mp2t", "Content-Length": "3"]
    } else {
      guard request.value(forHTTPHeaderField: "Authorization") == "fixture-secret",
        request.value(forHTTPHeaderField: "Range") == "bytes=4-8"
      else {
        client?.urlProtocol(self, didFailWithError: URLError(.userAuthenticationRequired))
        return
      }
      body = Data([4, 5, 6, 7, 8])
      status = 206
      headers = [
        "Content-Type": "video/mp4", "Content-Length": "5", "Content-Range": "bytes 4-8/100",
      ]
    }
    let response = HTTPURLResponse(
      url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers)!
    client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
    client?.urlProtocol(self, didLoad: body)
    client?.urlProtocolDidFinishLoading(self)
  }
  override func stopLoading() {}
}
@Suite(.serialized) struct GatewayTests {
  @Test func stoppedGatewayCannotRestart() async {
    let gateway = MediaGateway(source: URL(string: "https://origin.test/movie.mp4")!, headers: [:])
    gateway.stop()
    do {
      _ = try await gateway.start()
      Issue.record("Stopped session restarted")
    } catch { #expect(error is CancellationError) }
  }
  @Test func rangeStreamingAndTokenIsolation() async throws {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [StubProtocol.self]
    let gateway = MediaGateway(
      source: URL(string: "https://origin.test/movie.mp4")!,
      headers: ["Authorization": "fixture-secret"], configuration: configuration)
    let local = try await gateway.start()
    defer { gateway.stop() }
    var request = URLRequest(url: local)
    request.setValue("bytes=4-8", forHTTPHeaderField: "Range")
    let (body, response) = try await URLSession.shared.data(for: request)
    #expect((response as? HTTPURLResponse)?.statusCode == 206)
    #expect(
      (response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Content-Range") == "bytes 4-8/100")
    #expect(body == Data([4, 5, 6, 7, 8]))
    let wrong = URL(
      string: local.absoluteString.replacingOccurrences(
        of: local.pathComponents[1], with: "wrong-token"))!
    let (_, rejected) = try await URLSession.shared.data(from: wrong)
    #expect((rejected as? HTTPURLResponse)?.statusCode == 400)
  }
  @Test func redirectCredentialsAreStripped() async throws {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [StubProtocol.self]
    let gateway = MediaGateway(
      source: URL(string: "https://origin.test/redirect")!,
      headers: ["Authorization": "fixture-secret"], configuration: configuration)
    let local = try await gateway.start()
    defer { gateway.stop() }
    let (bytes, response) = try await URLSession.shared.data(from: local)
    #expect((response as? HTTPURLResponse)?.statusCode == 200)
    #expect(bytes == Data([9, 8, 7]))
  }
  @Test func playlistAndCDNCredentials() async throws {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [StubProtocol.self]
    let gateway = MediaGateway(
      source: URL(string: "https://origin.test/playlist.m3u8")!,
      headers: ["Authorization": "fixture-secret"], configuration: configuration)
    let local = try await gateway.start()
    defer { gateway.stop() }
    let (manifest, _) = try await URLSession.shared.data(from: local)
    let lines = String(decoding: manifest, as: UTF8.self).components(separatedBy: "\n")
    let segment = try #require(lines.first(where: { $0.hasPrefix("http://127.0.0.1:") }))
      .trimmingCharacters(in: .whitespaces)
    let (bytes, response) = try await URLSession.shared.data(from: URL(string: segment)!)
    #expect((response as? HTTPURLResponse)?.statusCode == 200)
    #expect(bytes == Data([9, 8, 7]))
  }
}
