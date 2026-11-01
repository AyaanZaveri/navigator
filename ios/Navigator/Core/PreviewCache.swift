import Foundation

public struct PreviewCache {
    private var frames: [Int:Data]=[:]
    private var order: [Int]=[]
    private var bytes=0
    public let limit: Int
    public init(limit: Int=16*1024*1024) { self.limit=max(0,limit) }
    public static func bucket(_ time: Double) -> Int { max(0,Int(time.rounded())) }
    public mutating func value(at second: Int) -> Data? {
        guard let frame=frames[second] else { return nil }
        order.removeAll { $0==second }; order.append(second); return frame
    }
    public mutating func insert(_ data: Data, at second: Int) {
        if let previous=frames.removeValue(forKey:second) { bytes-=previous.count }
        order.removeAll { $0==second }
        guard data.count<=limit else { return }
        frames[second]=data; bytes+=data.count; order.append(second)
        while bytes>limit, let oldest=order.first {
            order.removeFirst(); bytes-=frames.removeValue(forKey:oldest)?.count ?? 0
        }
    }
    public mutating func clear() { frames.removeAll(); order.removeAll(); bytes=0 }
    public var byteCount: Int { bytes }
}
