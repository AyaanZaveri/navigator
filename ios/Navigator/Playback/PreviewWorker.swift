import Foundation
import UIKit

/// Exactly one independent decoder. The active video is never used for seeking.
@MainActor final class PreviewWorker {
    let surface=UIView(frame:CGRect(x:0,y:0,width:448,height:252))
    private var engine:NativeVLC?
    private var source:URL?
    private var wanted:(id:Int,time:Int)?
    private var active:Int?
    private var snapshotRequested=false
    private var cache=PreviewCache()
    private var timeout:Task<Void,Never>?
    private var ready:((Int,Int,Data?)->Void)?
    func reset(source:URL?,ready:((Int,Int,Data?)->Void)?) {
        timeout?.cancel();timeout=nil;engine?.stop();engine?.changed=nil;engine?.snapshot=nil;engine?.surface.removeFromSuperview();engine=nil
        self.source=source;self.ready=ready;wanted=nil;active=nil;cache.clear()
    }
    func request(id:Int,time:Double?) {
        guard let time else { wanted=nil;return }
        let at=PreviewCache.bucket(time);wanted=(id,at)
        if let hit=cache.value(at:at) { wanted=nil;ready?(id,at,hit);return }
        pump()
    }
    private func pump() {
        guard active==nil,let desired=wanted,let source else { return }
        active=desired.time;snapshotRequested=false
        let player=NativeVLC();engine=player
        player.surface.frame=surface.bounds;surface.addSubview(player.surface)
        player.changed={ [weak self,weak player] in
            DispatchQueue.main.async {
                guard let self,let player,self.engine===player,let at=self.active,!self.snapshotRequested else { return }
                if player.failed { self.finish(nil);return }
                if player.hasVideo && player.position>=Double(at)-0.10 && player.position<=Double(at)+0.5 {
                    self.snapshotRequested=true;player.pause();player.takeSnapshot()
                }
            }
        }
        player.snapshot={ [weak self,weak player] data in
            guard let self,let player,self.engine===player else { return };self.finish(data)
        }
        player.load(source,start:Double(desired.time),silent:true)
        timeout=Task { [weak self,weak player] in
            try? await Task.sleep(for:.seconds(8))
            guard !Task.isCancelled,let self,let player,self.engine===player else { return };self.finish(nil)
        }
    }
    private func finish(_ data:Data?) {
        guard let at=active else { return }
        timeout?.cancel();timeout=nil;engine?.changed=nil;engine?.snapshot=nil;engine?.stop();engine?.surface.removeFromSuperview();engine=nil;active=nil
        if let data { cache.insert(data,at:at) }
        if let desired=wanted,desired.time==at { ready?(desired.id,at,data);wanted=nil }
        // A superseded sample can warm the cache, but must never resolve the
        // newest request with an image from a different timestamp.
        pump()
    }
    func suspend() { reset(source:source,ready:ready) }
}
