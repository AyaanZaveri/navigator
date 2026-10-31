package app.navigator.android;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.view.View;

/** Swipe timeline matches the React timeline's measured track, including its
 * rounded clip, white fill and buffered range. Only rendering is interpolated. */
final class ScrubPreviewView extends View {
    private final Paint paint=new Paint(3);
    private final Path clip=new Path();
    private final RectF measuredTrack=new RectF(),track=new RectF();
    private final int[] screen=new int[2];
    private final PlayerBarGlide glide=new PlayerBarGlide(this);
    private final ScrubPreviewPanel panel;
    private final float d;
    private long duration,buffered;
    private float bottomInset;
    ScrubPreviewView(Context context) {
        super(context); d=getResources().getDisplayMetrics().density;
        panel=new ScrubPreviewPanel(context);
        setVisibility(GONE); setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
    }
    void begin(long start,long duration,long buffered,float bottomInset) {
        this.duration=duration; this.buffered=buffered; this.bottomInset=bottomInset;
        glide.snap(duration>0 ? (float)start/duration : 0);
        panel.begin(start); panel.progress(start,.5f);
        setVisibility(VISIBLE); layoutPanel();
    }
    void setTrackBounds(float left,float top,float right,float bottom) {
        measuredTrack.set(left,top,right,bottom);
        if (getVisibility()==VISIBLE) { layoutPanel(); invalidate(); }
    }
    void clearTrackBounds() { measuredTrack.setEmpty(); }
    void progress(long target,float fraction) {
        panel.progress(target,fraction);
        glide.to(duration>0 ? (float)target/duration : 0);
    }
    void frame(Bitmap bitmap) { panel.frame(bitmap); }
    void hide() { glide.cancel(); panel.hide(); setVisibility(GONE); }
    private void measureTrack() {
        if (!measuredTrack.isEmpty()) track.set(measuredTrack);
        else {
            float bottom=getHeight()-Math.max(80*d,bottomInset+64*d);
            track.set(24*d,bottom-6*d,getWidth()-24*d,bottom);
        }
    }
    private void layoutPanel() {
        measureTrack(); getLocationOnScreen(screen);
        float width=Math.min(240*d,getWidth()-64*d);
        float height=Math.min(width*9/16,Math.max(48*d,track.top-120*d));
        float top=Math.max(12*d,track.top-height-82*d);
        panel.show(screen[0]+Math.round((getWidth()-width)/2-8*d),screen[1]+Math.round(top-8*d),
            Math.round(width+16*d),Math.round(height+66*d));
    }
    @Override protected void onDraw(Canvas c) {
        measureTrack(); float radius=track.height()/2;
        paint.setColor(Color.argb(51,255,255,255)); c.drawRoundRect(track,radius,radius,paint);
        clip.reset(); clip.addRoundRect(track,radius,radius,Path.Direction.CW);
        int save=c.save(); c.clipPath(clip);
        paint.setColor(Color.argb(77,255,255,255));
        c.drawRect(track.left,track.top,track.left+track.width()*fraction(buffered),track.bottom,paint);
        paint.setColor(Color.WHITE);
        c.drawRect(track.left,track.top,track.left+track.width()*glide.value(),track.bottom,paint);
        c.restoreToCount(save);
    }
    private float fraction(long time) { return duration>0 ? Math.max(0,Math.min(1,(float)time/duration)) : 0; }
    @Override protected void onSizeChanged(int w,int h,int oldw,int oldh) {
        super.onSizeChanged(w,h,oldw,oldh);
        if (getVisibility()==VISIBLE) layoutPanel();
    }
    @Override protected void onDetachedFromWindow() { hide(); super.onDetachedFromWindow(); }
}
