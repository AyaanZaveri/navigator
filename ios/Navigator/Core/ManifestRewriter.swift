import Foundation

#if canImport(FoundationXML)
  import FoundationXML
#endif

public enum ManifestRewriter {
  public static func rewrite(
    _ data: Data, url: URL, contentType: String, route: @escaping (URL) throws -> URL
  ) throws -> Data {
    guard data.count <= 2 * 1024 * 1024, let text = String(data: data, encoding: .utf8) else {
      throw PolicyError.invalidURL
    }
    if text.trimmingCharacters(in: .whitespacesAndNewlines).hasPrefix("#EXTM3U") {
      let uri = try NSRegularExpression(pattern: "URI=\"([^\"]+)\"")
      let lines = try text.components(separatedBy: "\n").map { line -> String in
        let clean = line.trimmingCharacters(in: .whitespacesAndNewlines)
        if clean.isEmpty { return line }
        if !clean.hasPrefix("#") { return try resolve(clean, base: url, route: route) }
        var result = line
        for match in uri.matches(in: line, range: NSRange(line.startIndex..., in: line)).reversed()
        {
          guard let range = Range(match.range(at: 1), in: line),
            let target = Range(match.range(at: 1), in: result)
          else { continue }
          result.replaceSubrange(
            target, with: try resolve(String(line[range]), base: url, route: route))
        }
        return result
      }
      return Data(lines.joined(separator: "\n").utf8)
    }
    let delegate = DASHRewriter(base: url, route: route)
    let parser = XMLParser(data: data)
    parser.delegate = delegate
    parser.shouldResolveExternalEntities = false
    guard parser.parse(), delegate.error == nil else {
      throw delegate.error ?? PolicyError.invalidURL
    }
    return Data(delegate.output.utf8)
  }
  private static func resolve(_ text: String, base: URL, route: (URL) throws -> URL) throws
    -> String
  {
    guard let resolved = URL(string: text, relativeTo: base)?.absoluteURL else {
      throw PolicyError.invalidURL
    }
    return try route(StreamPolicy.url(resolved.absoluteString)).absoluteString
  }
  private final class DASHRewriter: NSObject, XMLParserDelegate {
    struct Element {
      var base: URL
      var text = ""
      var isBase: Bool
    }
    var stack: [Element] = []
    var output = "", error: Error?
    let base: URL, route: (URL) throws -> URL
    init(base: URL, route: @escaping (URL) throws -> URL) {
      self.base = base
      self.route = route
    }
    func escaped(_ text: String) -> String {
      text.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(
        of: "\"", with: "&quot;"
      ).replacingOccurrences(of: "<", with: "&lt;").replacingOccurrences(of: ">", with: "&gt;")
    }
    func parser(
      _ parser: XMLParser, didStartElement name: String, namespaceURI: String?,
      qualifiedName: String?, attributes: [String: String]
    ) {
      let current = stack.last?.base ?? base
      stack.append(Element(base: current, isBase: name == "BaseURL"))
      output += "<" + name
      do {
        for (key, value) in attributes.sorted(by: { $0.key < $1.key }) {
          let updated =
            ["media", "initialization", "sourceURL", "xlink:href"].contains(key)
            ? try ManifestRewriter.resolve(value, base: current, route: route) : value
          output += " \(key)=\"\(escaped(updated))\""
        }
        output += ">"
      } catch {
        self.error = error
        parser.abortParsing()
      }
    }
    func parser(_ parser: XMLParser, foundCharacters text: String) {
      if stack.last?.isBase == true {
        stack[stack.count - 1].text += text
      } else {
        output += escaped(text)
      }
    }
    func parser(
      _ parser: XMLParser, didEndElement name: String, namespaceURI: String?, qualifiedName: String?
    ) {
      guard let element = stack.popLast() else { return }
      if element.isBase {
        do {
          let value = element.text.trimmingCharacters(in: .whitespacesAndNewlines)
          guard let resolved = URL(string: value, relativeTo: element.base)?.absoluteURL else {
            throw PolicyError.invalidURL
          }
          output += escaped(try route(StreamPolicy.url(resolved.absoluteString)).absoluteString)
          if !stack.isEmpty { stack[stack.count - 1].base = resolved }
        } catch {
          self.error = error
          parser.abortParsing()
        }
      }
      output += "</\(name)>"
    }
    func parser(_ parser: XMLParser, foundCDATA data: Data) {
      self.parser(parser, foundCharacters: String(decoding: data, as: UTF8.self))
    }
  }
}

public struct GatewayRequest: Equatable {
  public let method: String, target: String, range: String?
  public init(_ data: Data) throws {
    guard data.count <= 16384, let text = String(data: data, encoding: .utf8),
      text.hasSuffix("\r\n\r\n")
    else { throw PolicyError.invalidMessage }
    let lines = text.components(separatedBy: "\r\n")
    let first = lines[0].split(separator: " ")
    guard first.count == 3, ["GET", "HEAD"].contains(String(first[0])), first[2] == "HTTP/1.1",
      first[1].hasPrefix("/"), !first[1].hasPrefix("//")
    else { throw PolicyError.invalidMessage }
    var range: String?
    for line in lines.dropFirst() where !line.isEmpty {
      guard let colon = line.firstIndex(of: ":") else { throw PolicyError.invalidHeaders }
      let name = line[..<colon].lowercased()
      let value = line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces)
      if name == "range" {
        guard range == nil,
          value.range(of: "^bytes=([0-9]+-[0-9]*|-[0-9]+)$", options: .regularExpression) != nil
        else { throw PolicyError.invalidHeaders }
        range = value
      }
      if ["content-length", "transfer-encoding"].contains(name) {
        throw PolicyError.invalidHeaders
      }
    }
    method = String(first[0])
    target = String(first[1])
    self.range = range
  }
}
