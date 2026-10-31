#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>
@interface LayoutCheck : NSObject <WKNavigationDelegate>
@property WKWebView *view;
@property NSWindow *window;
@property NSString *script;
@end
@implementation LayoutCheck
- (void)webView:(WKWebView *)webView didFinishNavigation:(WKNavigation *)navigation {
        NSString *script = @"await Promise.all([...document.images].map(img=>img.decode().catch(()=>{}))); return JSON.stringify([...document.querySelectorAll('[data-case]')].map(el=>{const img=el.querySelector('img');let frame=img.parentElement;while(frame!==el&&getComputedStyle(frame).aspectRatio==='auto')frame=frame.parentElement;const i=img.getBoundingClientRect();return {name:el.dataset.case,frame:{width:frame.clientWidth,height:frame.clientHeight},image:{width:i.width,height:i.height},natural:{width:img.naturalWidth,height:img.naturalHeight},fit:getComputedStyle(img).objectFit}}))";
        [webView callAsyncJavaScript:self.script ?: script arguments:@{} inFrame:nil inContentWorld:WKContentWorld.pageWorld completionHandler:^(id result, NSError *error) {
            if(error) {fprintf(stderr,"%s\n",error.description.UTF8String);exit(1);}
            printf("%s\n",[result UTF8String]); exit(0);
        }];
}
@end
int main(int argc, char **argv) {
    @autoreleasepool {
        if(argc!=2 && argc!=3) return 2;
        [NSApplication sharedApplication];
        [NSApp setActivationPolicy:NSApplicationActivationPolicyProhibited];
        LayoutCheck *check = [LayoutCheck new];
        if(argc==3) check.script = [NSString stringWithContentsOfFile:[NSString stringWithUTF8String:argv[2]] encoding:NSUTF8StringEncoding error:nil];
        check.window = [[NSWindow alloc] initWithContentRect:NSMakeRect(0,0,1200,900) styleMask:NSWindowStyleMaskBorderless backing:NSBackingStoreBuffered defer:NO];
        WKWebViewConfiguration *configuration = [WKWebViewConfiguration new];
        configuration.websiteDataStore = [WKWebsiteDataStore nonPersistentDataStore];
        check.view = [[WKWebView alloc] initWithFrame:NSMakeRect(0,0,1200,900) configuration:configuration];
        check.view.navigationDelegate = check;
        check.window.contentView = check.view;
        NSString *html = [NSString stringWithContentsOfFile:[NSString stringWithUTF8String:argv[1]] encoding:NSUTF8StringEncoding error:nil];
        [check.view loadHTMLString:html baseURL:nil];
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(20 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{fprintf(stderr,"Layout test timed out\n");exit(1);});
        [NSApp run];
    }
}
