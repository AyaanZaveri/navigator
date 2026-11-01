import Foundation

public enum PolicyError: Error, Equatable { case invalidOrigin, invalidURL, invalidHeaders, invalidMessage }

public struct TrustedOrigin: Equatable, Sendable {
    public let url: URL
    public init(_ value: String) throws {
        guard let url=URL(string:value), url.scheme?.lowercased()=="https", url.host != nil,
              url.user==nil, url.password==nil, url.query==nil, url.fragment==nil,
              url.path.isEmpty || url.path=="/" else { throw PolicyError.invalidOrigin }
        guard url.port.map({(1...65535).contains($0)}) ?? true,
              var parts=URLComponents(url:url,resolvingAgainstBaseURL:false) else { throw PolicyError.invalidOrigin }
        parts.host=parts.host?.lowercased();parts.path=""
        if parts.port==443 { parts.port=nil }
        guard let canonical=parts.url else { throw PolicyError.invalidOrigin };self.url=canonical
    }
    public func matches(_ candidate: URL) -> Bool {
        candidate.scheme?.lowercased()=="https" && candidate.host?.lowercased()==url.host?.lowercased()
            && (candidate.port ?? 443)==(url.port ?? 443) && candidate.user==nil && candidate.password==nil
    }
}

public enum StreamPolicy {
    public static func url(_ value: String) throws -> URL {
        guard value.utf8.count<=16384, let url=URL(string:value), url.scheme?.lowercased()=="https",
              let host=url.host, !host.isEmpty, url.user==nil, url.password==nil,
              url.port.map({ (1...65535).contains($0) }) ?? true else { throw PolicyError.invalidURL }
        return url
    }
    public static func headers(_ values: [String:String]) throws -> [String:String] {
        guard values.count<=64 else { throw PolicyError.invalidHeaders }
        let token=CharacterSet(charactersIn:"!#$%&'*+-.^_`|~0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ")
        for (name,value) in values {
            guard !name.isEmpty, name.unicodeScalars.allSatisfy(token.contains), value.utf8.count<=8192,
                  !value.unicodeScalars.contains(where: { $0.value<32 || $0.value==127 }),
                  !["host","connection","content-length","transfer-encoding","range"].contains(name.lowercased())
            else { throw PolicyError.invalidHeaders }
        }
        return values
    }
    public static func scopedHeaders(_ headers: [String:String], original: URL, target: URL) -> [String:String] {
        let same=original.scheme?.lowercased()==target.scheme?.lowercased() && original.host?.lowercased()==target.host?.lowercased()
            && (original.port ?? 443)==(target.port ?? 443)
        return headers.filter { same || ["user-agent","referer","origin"].contains($0.key.lowercased()) }
    }
}

public struct BridgeCommand {
    public let type: String
    public let session: String?
    public let body: [String:Any]
    public init(_ body: Any) throws {
        guard let dict=body as? [String:Any], JSONSerialization.isValidJSONObject(dict),
              let data=try? JSONSerialization.data(withJSONObject:dict), data.count<=65536,
              let type=dict["type"] as? String,
              ["hello","appearance","visible","load","play","pause","stop","seek","volume","muted","rate","track","thumbnail","video-fit","fullscreen","settings","seek-feedback"].contains(type)
        else { throw PolicyError.invalidMessage }
        let session=dict["session"] as? String
        if ["load","play","pause","stop","seek","volume","muted","rate","track","thumbnail","video-fit","seek-feedback"].contains(type) {
            guard let session, session.range(of:"^[A-Za-z0-9_-]{1,128}$",options:.regularExpression) != nil else { throw PolicyError.invalidMessage }
        }
        if type=="load" {
            guard let value=dict["url"] as? String else { throw PolicyError.invalidURL }
            _=try StreamPolicy.url(value)
            if let raw=dict["headers"], !(raw is NSNull) {
                guard let headers=raw as? [String:String] else { throw PolicyError.invalidHeaders }
                _=try StreamPolicy.headers(headers)
            }
        }
        self.type=type; self.session=session; self.body=dict
    }
    public func number(_ name: String, range: ClosedRange<Double>) -> Double? {
        guard let value=body[name] as? NSNumber, CFGetTypeID(value) != CFBooleanGetTypeID() else { return nil }
        let n=value.doubleValue
        return n.isFinite && range.contains(n) ? n : nil
    }
}

import CoreFoundation
