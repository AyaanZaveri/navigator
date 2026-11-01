import Foundation
import Network
#if canImport(NavigatorCore)
import NavigatorCore
#endif

/// A per-playback, loopback-only gateway. Mutable networking state is confined
/// to `queue`; URLSession and NWConnection callbacks use that same serial queue.
final class MediaGateway: NSObject, URLSessionDataDelegate {
    private let source: URL
    private let headers: [String:String]
    private let token=UUID().uuidString
    private let configuration:URLSessionConfiguration
    private let queue=DispatchQueue(label:"app.navigator.media-gateway",qos:.userInitiated)
    private var listener:NWListener?
    private var starting:CheckedContinuation<URL,Error>?
    private var base:URL?
    private var allowedOrigins=Set<String>()
    private var exchanges:[Int:Exchange]=[:]
    private var clients:[UUID:NWConnection]=[:]
    private var stopped=false
    private lazy var session:URLSession = {
        let c=configuration.copy() as! URLSessionConfiguration
        c.httpShouldSetCookies=false;c.httpCookieStorage=nil;c.urlCredentialStorage=nil;c.urlCache=nil
        c.timeoutIntervalForRequest=25;c.timeoutIntervalForResource=3600;c.httpMaximumConnectionsPerHost=6
        let delegateQueue=OperationQueue();delegateQueue.maxConcurrentOperationCount=1;delegateQueue.underlyingQueue=queue
        return URLSession(configuration:c,delegate:self,delegateQueue:delegateQueue)
    }()
    private final class Exchange {
        let client: NWConnection, method:String, upstream:URL
        var response:HTTPURLResponse?, manifest=false, data=Data(), pending=0, suspended=false, redirects=0, failed=false
        init(_ client:NWConnection,_ method:String,_ upstream:URL) { self.client=client;self.method=method;self.upstream=upstream }
    }
    init(source:URL,headers:[String:String],configuration:URLSessionConfiguration = .ephemeral) { self.source=source;self.headers=headers;self.configuration=configuration;super.init() }
    func start() async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            queue.async {
                guard !self.stopped else { continuation.resume(throwing:CancellationError());return }
                do {
                    let p=NWParameters.tcp
                    p.requiredLocalEndpoint = .hostPort(host:"127.0.0.1",port:.any)
                    let listener=try NWListener(using:p,on:.any);self.listener=listener;self.starting=continuation
                    listener.stateUpdateHandler = { [weak self] state in
                        guard let self else { return }
                        switch state {
                        case .ready:
                            guard let pending=self.starting,let port=self.listener?.port else { return };self.starting=nil
                            self.base=URL(string:"http://127.0.0.1:\(port.rawValue)")
                            do { pending.resume(returning:try self.route(self.source)) }
                            catch { pending.resume(throwing:error) }
                        case .failed(let error): self.starting?.resume(throwing:error);self.starting=nil
                        case .cancelled: self.starting?.resume(throwing:CancellationError());self.starting=nil
                        default: break
                        }
                    }
                    listener.newConnectionHandler={ [weak self] c in self?.accept(c) }
                    listener.start(queue:self.queue)
                } catch { continuation.resume(throwing:error) }
            }
        }
    }
    func stop() {
        queue.async {
            self.stopped=true;self.starting?.resume(throwing:CancellationError());self.starting=nil
            self.listener?.stateUpdateHandler=nil;self.listener?.cancel();self.listener=nil
            self.session.invalidateAndCancel()
            self.clients.values.forEach{$0.cancel()};self.clients.removeAll();self.exchanges.removeAll()
        }
    }
    private func origin(_ url:URL) throws -> String {
        let url=try StreamPolicy.url(url.absoluteString)
        guard var c=URLComponents(url:url,resolvingAgainstBaseURL:false) else { throw PolicyError.invalidURL }
        c.path="";c.query=nil;c.fragment=nil
        guard let value=c.string else { throw PolicyError.invalidURL };return value
    }
    private func route(_ upstream:URL) throws -> URL {
        guard let base else { throw PolicyError.invalidURL }
        let authority=try origin(upstream);allowedOrigins.insert(authority)
        let encoded=Data(authority.utf8).base64EncodedString().replacingOccurrences(of:"+",with:"-").replacingOccurrences(of:"/",with:"_").replacingOccurrences(of:"=",with:"")
        guard let c=URLComponents(url:upstream,resolvingAgainstBaseURL:false),
              let url=URL(string:base.absoluteString+"/\(token)/\(encoded)"+(c.percentEncodedPath.isEmpty ? "/" : c.percentEncodedPath)+(c.percentEncodedQuery.map{"?"+$0} ?? "")) else { throw PolicyError.invalidURL }
        return url
    }
    private func resolve(_ target:String) throws -> URL {
        let pieces=target.split(separator:"/",omittingEmptySubsequences:false)
        guard pieces.count>=4,pieces[1]==Substring(token) else { throw PolicyError.invalidURL }
        var encoded=String(pieces[2]).replacingOccurrences(of:"-",with:"+").replacingOccurrences(of:"_",with:"/")
        encoded+=String(repeating:"=",count:(4-encoded.count%4)%4)
        guard let bytes=Data(base64Encoded:encoded),let authority=String(data:bytes,encoding:.utf8),allowedOrigins.contains(authority) else { throw PolicyError.invalidURL }
        return try StreamPolicy.url(authority+"/"+pieces.dropFirst(3).joined(separator:"/"))
    }
    private func accept(_ client:NWConnection) {
        guard !stopped,clients.count<6 else { client.cancel();return }
        let id=UUID();clients[id]=client
        client.stateUpdateHandler = { [weak self,weak client] state in
            guard let self else { return }
            if case .failed = state { self.close(client,id:id) }
            if case .cancelled = state { self.close(client,id:id) }
        }
        client.start(queue:queue)
        queue.asyncAfter(deadline:.now()+25) { [weak self,weak client] in
            guard let self,let client,self.clients[id] != nil else { return }
            // Once upstream starts, its request timeout governs progress.
            if !self.exchanges.values.contains(where:{$0.client===client}) { self.close(client,id:id) }
        }
        read(client,id:id,buffer:Data())
    }
    private func close(_ client:NWConnection?,id:UUID) {
        clients.removeValue(forKey:id)
        for (key,value) in exchanges where value.client===client {
            session.getAllTasks { tasks in tasks.first(where:{$0.taskIdentifier==key})?.cancel() }
            exchanges.removeValue(forKey:key)
        }
        client?.cancel()
    }
    private func read(_ client:NWConnection,id:UUID,buffer:Data) {
        client.receive(minimumIncompleteLength:1,maximumLength:4096) { [weak self] data,_,done,error in
            guard let self else { return }
            var bytes=buffer;bytes.append(data ?? Data())
            guard bytes.count<=16384,error==nil else { self.reject(client,code:400);return }
            if bytes.range(of:Data("\r\n\r\n".utf8)) != nil {
                do {
                    let request=try GatewayRequest(bytes),url=try self.resolve(request.target)
                    var upstream=URLRequest(url:url);upstream.httpMethod=request.method
                    for (key,value) in StreamPolicy.scopedHeaders(self.headers,original:self.source,target:url) { upstream.setValue(value,forHTTPHeaderField:key) }
                    upstream.setValue(request.range,forHTTPHeaderField:"Range")
                    upstream.setValue("identity",forHTTPHeaderField:"Accept-Encoding")
                    let task=self.session.dataTask(with:upstream)
                    self.exchanges[task.taskIdentifier]=Exchange(client,request.method,url);task.resume()
                } catch { self.reject(client,code:400) }
            } else if !done { self.read(client,id:id,buffer:bytes) } else { self.close(client,id:id) }
        }
    }
    private func reject(_ client:NWConnection,code:Int) {
        client.send(content:Data("HTTP/1.1 \(code) Error\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".utf8),completion:.contentProcessed{_ in client.cancel()})
    }
    private func responseHead(_ response:HTTPURLResponse,length:Int?=nil) -> Data {
        var lines=["HTTP/1.1 \(response.statusCode) Response","Connection: close"]
        let excluded=Set(["connection","transfer-encoding","content-length","content-encoding","set-cookie","location"])
        for (name,value) in response.allHeaderFields {
            guard let name=name as? String,!excluded.contains(name.lowercased()) else { continue }
            let value=String(describing:value)
            guard !value.contains("\r"),!value.contains("\n") else { continue }
            lines.append("\(name): \(value)")
        }
        if let length { lines.append("Content-Length: \(length)") }
        else if let size=response.value(forHTTPHeaderField:"Content-Length") { lines.append("Content-Length: \(size)") }
        return Data((lines.joined(separator:"\r\n")+"\r\n\r\n").utf8)
    }
    func urlSession(_ session:URLSession,task:URLSessionTask,willPerformHTTPRedirection response:HTTPURLResponse,newRequest:URLRequest,completionHandler:@escaping(URLRequest?)->Void) {
        guard let e=exchanges[task.taskIdentifier],let target=newRequest.url,(try? StreamPolicy.url(target.absoluteString)) != nil,e.redirects<8 else { completionHandler(nil);return }
        e.redirects+=1
        var request=newRequest
        // URLSession may copy original credentials into its proposed redirect.
        for key in headers.keys { request.setValue(nil,forHTTPHeaderField:key) }
        for (key,value) in StreamPolicy.scopedHeaders(headers,original:source,target:target) { request.setValue(value,forHTTPHeaderField:key) }
        completionHandler(request)
    }
    func urlSession(_ session:URLSession,dataTask:URLSessionDataTask,didReceive response:URLResponse,completionHandler:@escaping(URLSession.ResponseDisposition)->Void) {
        guard let e=exchanges[dataTask.taskIdentifier],let http=response as? HTTPURLResponse else { completionHandler(.cancel);return }
        guard (200...299).contains(http.statusCode) else { reject(e.client,code:http.statusCode);completionHandler(.cancel);return }
        e.response=http
        let type=http.mimeType?.lowercased() ?? "",path=http.url?.path.lowercased() ?? ""
        e.manifest=e.method != "HEAD" && (type.contains("mpegurl") || type.contains("dash+xml") || path.hasSuffix(".m3u8") || path.hasSuffix(".mpd"))
        if !e.manifest { e.client.send(content:responseHead(http),completion:.contentProcessed{error in if error != nil { dataTask.cancel() }}) }
        completionHandler(.allow)
    }
    func urlSession(_ session:URLSession,dataTask:URLSessionDataTask,didReceive data:Data) {
        guard let e=exchanges[dataTask.taskIdentifier],!e.failed else { return }
        if e.manifest {
            e.data.append(data)
            if e.data.count>2*1024*1024 { e.failed=true;reject(e.client,code:502);dataTask.cancel() }
            return
        }
        e.pending+=data.count
        if e.pending>1024*1024 && !e.suspended { e.suspended=true;dataTask.suspend() }
        e.client.send(content:data,completion:.contentProcessed { [weak self,weak dataTask] error in
            guard let self,let dataTask else { return }
            e.pending-=data.count
            if error != nil { dataTask.cancel();e.client.cancel();return }
            if e.suspended && e.pending<256*1024 { e.suspended=false;dataTask.resume() }
            self.finishIfDrained(dataTask,e)
        })
    }
    private func finishIfDrained(_ task:URLSessionTask,_ e:Exchange) {
        if e.failed && e.pending==0 { e.client.send(content:nil,contentContext:.finalMessage,isComplete:true,completion:.contentProcessed{_ in e.client.cancel()}) }
    }
    func urlSession(_ session:URLSession,task:URLSessionTask,didCompleteWithError error:Error?) {
        guard let e=exchanges[task.taskIdentifier] else { return }
        if error != nil { e.client.cancel();exchanges.removeValue(forKey:task.taskIdentifier);return }
        if e.manifest,let response=e.response {
            do {
                let rewritten=try ManifestRewriter.rewrite(e.data,url:response.url ?? e.upstream,contentType:response.mimeType ?? "",route:{try self.route($0)})
                e.client.send(content:responseHead(response,length:rewritten.count)+rewritten,completion:.contentProcessed{_ in e.client.cancel()})
            } catch { reject(e.client,code:502) }
        } else { e.failed=true;finishIfDrained(task,e) }
    }
}
