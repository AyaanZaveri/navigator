#import "NativeVLC.h"
#import <MobileVLCKit/MobileVLCKit.h>
@interface NativeVLC () <VLCMediaPlayerDelegate>
@property(nonatomic,strong) VLCMediaPlayer *player;
@property(nonatomic,strong) UIView *surface;
@property(nonatomic,copy,nullable) NSString *snapshotPath;
@end
@implementation NativeVLC
- (instancetype)init {
    if ((self=[super init])) {
        _surface=[[UIView alloc] init];_surface.backgroundColor=UIColor.blackColor;
        _player=[[VLCMediaPlayer alloc] init];_player.delegate=self;_player.drawable=_surface;
#if DEBUG
        VLCConsoleLogger *logger=[VLCConsoleLogger new];logger.level=kVLCLogLevelDebug;
        _player.libraryInstance.loggers=@[logger];
#endif
    }
    return self;
}
- (void)loadURL:(NSURL *)url start:(double)seconds silent:(BOOL)silent {
    [self.player stop];
    VLCMedia *media=[VLCMedia mediaWithURL:url];
    [media addOptions:@{@"network-caching":@750,@"start-time":@(MAX(0,seconds)),@"input-fast-seek":@NO}];
    if (silent) [media addOptions:@{@"no-audio":@YES,@"no-spu":@YES}];
    self.player.media=media;[self.player play];
}
- (double)position { return MAX(0,self.player.time.intValue)/1000.0; }
- (double)duration { return MAX(0,self.player.media.length.intValue)/1000.0; }
- (BOOL)playing { return self.player.isPlaying; }
- (BOOL)buffering { return self.player.state==VLCMediaPlayerStateOpening || self.player.state==VLCMediaPlayerStateBuffering; }
- (BOOL)ended { return self.player.state==VLCMediaPlayerStateEnded; }
- (BOOL)failed { return self.player.state==VLCMediaPlayerStateError; }
- (BOOL)hasVideo { return self.player.hasVideoOut; }
- (BOOL)seekable { return self.player.isSeekable; }
- (CGSize)videoSize { return self.player.videoSize; }
- (void)setRenderingEnabled:(BOOL)enabled { self.player.drawable=enabled ? self.surface : nil; }
- (void)play { [self.player play]; }
- (void)pause { [self.player pause]; }
- (void)stop {
    [self.player stop];
    if (self.snapshotPath) { [NSFileManager.defaultManager removeItemAtPath:self.snapshotPath error:nil];self.snapshotPath=nil; }
}
- (void)seek:(double)seconds { self.player.time=[VLCTime timeWithInt:(int)MIN(INT_MAX,MAX(0,seconds*1000))]; }
- (void)setVolume:(double)volume muted:(BOOL)muted { self.player.audio.volume=(int)(MAX(0,MIN(1,volume))*100);self.player.audio.muted=muted; }
- (void)setRate:(double)rate { self.player.rate=(float)rate; }
- (void)setFit:(NSString *)mode width:(NSInteger)width height:(NSInteger)height {
    self.player.scaleFactor=0;self.player.videoAspectRatio=NULL;self.player.videoCropGeometry=NULL;
    if (width<=0 || height<=0) return;
    NSString *ratio=[NSString stringWithFormat:@"%ld:%ld",(long)width,(long)height];
    if ([mode isEqualToString:@"crop"]) self.player.videoCropGeometry=(char *)ratio.UTF8String;
    if ([mode isEqualToString:@"stretch"]) self.player.videoAspectRatio=(char *)ratio.UTF8String;
}
- (NSArray<NSDictionary *> *)tracks {
    NSMutableArray *result=[NSMutableArray array];
    NSArray *groups=@[@[self.player.audioTrackIndexes?:@[],self.player.audioTrackNames?:@[],@"audio",@(self.player.currentAudioTrackIndex)],
                      @[self.player.videoSubTitlesIndexes?:@[],self.player.videoSubTitlesNames?:@[],@"sub",@(self.player.currentVideoSubTitleIndex)]];
    for (NSArray *group in groups) {
        NSArray *indexes=group[0],*names=group[1];
        for (NSUInteger i=0;i<MIN(indexes.count,names.count);i++) {
            int identifier=[indexes[i] intValue];if (identifier<0) continue;
            [result addObject:@{@"id":@(identifier),@"type":group[2],@"title":[names[i] description],@"selected":@([group[3] intValue]==identifier)}];
        }
    }
    return result;
}
- (void)selectKind:(NSString *)kind identifier:(int)identifier {
    if ([kind isEqualToString:@"audio"]) self.player.currentAudioTrackIndex=identifier;
    else self.player.currentVideoSubTitleIndex=identifier;
}
- (void)takeSnapshot {
    if (self.snapshotPath) return;
    self.snapshotPath=[NSTemporaryDirectory() stringByAppendingPathComponent:[NSUUID.UUID.UUIDString stringByAppendingString:@".png"]];
    [self.player saveVideoSnapshotAt:self.snapshotPath withWidth:448 andHeight:0];
}
- (void)mediaPlayerStateChanged:(NSNotification *)note {
#if DEBUG
    NSLog(@"[DEBUG-IOS] VLC state=%@ time=%.3f",VLCMediaPlayerStateToString(self.player.state),self.position);
#endif
    if (self.changed) self.changed();
}
- (void)mediaPlayerTimeChanged:(NSNotification *)note { if (self.changed) self.changed(); }
- (void)mediaPlayerSnapshot:(NSNotification *)note {
    NSString *path=self.snapshotPath;self.snapshotPath=nil;
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED,0),^{
        NSData *png=path ? [NSData dataWithContentsOfFile:path] : nil;
        UIImage *image=png ? [UIImage imageWithData:png] : nil;
        NSData *jpeg=image ? UIImageJPEGRepresentation(image,0.74) : nil;
        if (path) [NSFileManager.defaultManager removeItemAtPath:path error:nil];
        dispatch_async(dispatch_get_main_queue(),^{if (self.snapshot) self.snapshot(jpeg);});
    });
}
- (void)dealloc { self.player.delegate=nil;self.player.drawable=nil;[self.player stop]; }
@end
