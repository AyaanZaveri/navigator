import Testing
import Foundation
@testable import NavigatorCore

@Test func originsAndCredentialScope() throws {
    let origin=try TrustedOrigin("https://navigator.test")
    #expect(try TrustedOrigin("HTTPS://NAVIGATOR.TEST:443/")==origin)
    #expect(origin.matches(URL(string:"https://navigator.test/movie/1")!))
    #expect(!origin.matches(URL(string:"https://navigator.test.attacker.test")!))
    #expect(throws:PolicyError.self) { try TrustedOrigin("http://navigator.test") }
    #expect(throws:PolicyError.self) { try StreamPolicy.url("https://user:password@cdn.test/video") }
    let h=["Authorization":"secret","User-Agent":"Navigator","X-Provider":"private"]
    let scoped=StreamPolicy.scopedHeaders(h,original:URL(string:"https://origin.test/a")!,target:URL(string:"https://cdn.test/b")!)
    #expect(scoped==["User-Agent":"Navigator"])
    #expect(throws:PolicyError.self) { try StreamPolicy.headers(["Referer":"safe\r\nInjected: bad"]) }
}
@Test func commandsAreSessionBoundAndNumbersAreFinite() throws {
    #expect(throws:PolicyError.self) { try BridgeCommand(["type":"seek","session":"../bad"]) }
    #expect(throws:PolicyError.self) { try BridgeCommand(["type":"load","session":"one","url":"http://cdn.test/a.mkv"]) }
    let c=try BridgeCommand(["type":"seek","session":"one","position":true])
    #expect(c.number("position",range:0...100)==nil)
}
@Test func cacheIsBoundedAndPromotesHits() {
    var cache=PreviewCache(limit:4)
    cache.insert(Data([1,2]),at:1);cache.insert(Data([3,4]),at:2)
    #expect(cache.value(at:1)==Data([1,2]))
    cache.insert(Data([5,6]),at:3)
    #expect(cache.value(at:2)==nil);#expect(cache.byteCount==4)
    cache.clear();#expect(cache.value(at:1)==nil)
}
@Test func playlistRewritesSegmentsKeysAndPreservesQueries() throws {
    let source=Data("#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI=\"../key?k=a%2Fb\"\nvideo/001.ts?sig=abc%2Fdef\n".utf8)
    let out=try ManifestRewriter.rewrite(source,url:URL(string:"https://cdn.test/root/master.m3u8")!,contentType:"",route:{url in
        URL(string:"http://127.0.0.1:1234/token/"+url.absoluteString.addingPercentEncoding(withAllowedCharacters:.alphanumerics)!)!
    })
    let text=String(decoding:out,as:UTF8.self)
    #expect(!text.contains("URI=\"../"));#expect(text.contains("127.0.0.1"));#expect(text.contains("sig"))
}
@Test func dashKeepsTemplatesVisible() throws {
    let source=Data("<MPD><Period><BaseURL>https://cdn.test/movie/</BaseURL><SegmentTemplate media=\"$RepresentationID$/$Number$.m4s\" initialization=\"init.mp4\"/></Period></MPD>".utf8)
    let out=try ManifestRewriter.rewrite(source,url:URL(string:"https://origin.test/main.mpd")!,contentType:"",route:{u in URL(string:"http://127.0.0.1:1/token/cdn"+u.path)!})
    #expect(String(decoding:out,as:UTF8.self).contains("$RepresentationID$/$Number$.m4s"))
}
@Test func gatewayRejectsSmugglingAndMultipleRanges() throws {
    let ok=try GatewayRequest(Data("GET /token/source/file HTTP/1.1\r\nRange: bytes=4-10\r\n\r\n".utf8))
    #expect(ok.range=="bytes=4-10")
    #expect(throws:PolicyError.self) { try GatewayRequest(Data("POST /x HTTP/1.1\r\n\r\n".utf8)) }
    #expect(throws:PolicyError.self) { try GatewayRequest(Data("GET /x HTTP/1.1\r\nRange: bytes=0-1,3-4\r\n\r\n".utf8)) }
}
