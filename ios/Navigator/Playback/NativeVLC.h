#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>
NS_ASSUME_NONNULL_BEGIN
/// Stable Objective-C facade over the pinned VLCKit 3.7 API.
@interface NativeVLC : NSObject
@property(nonatomic,copy,nullable) void (^changed)(void);
@property(nonatomic,copy,nullable) void (^snapshot)(NSData * _Nullable);
@property(nonatomic,readonly) UIView *surface;
@property(nonatomic,readonly) double position;
@property(nonatomic,readonly) double duration;
@property(nonatomic,readonly) BOOL playing;
@property(nonatomic,readonly) BOOL buffering;
@property(nonatomic,readonly) BOOL ended;
@property(nonatomic,readonly) BOOL failed;
@property(nonatomic,readonly) BOOL hasVideo;
@property(nonatomic,readonly) BOOL hasVideoTrack;
@property(nonatomic,readonly) BOOL seekable;
@property(nonatomic,readonly) CGSize videoSize;
- (void)loadURL:(NSURL *)url start:(double)seconds silent:(BOOL)silent NS_SWIFT_NAME(load(_:start:silent:));
- (void)play;
- (void)pause;
- (void)stop;
- (void)seek:(double)seconds;
- (void)setVolume:(double)volume muted:(BOOL)muted;
- (void)setRate:(double)rate;
- (void)setFit:(NSString *)mode width:(NSInteger)width height:(NSInteger)height;
- (NSArray<NSDictionary *> *)tracks;
- (void)selectKind:(NSString *)kind identifier:(int)identifier;
- (void)takeSnapshot;
- (void)setRenderingEnabled:(BOOL)enabled;
@end
NS_ASSUME_NONNULL_END
