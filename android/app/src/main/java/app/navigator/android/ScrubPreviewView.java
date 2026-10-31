package app.navigator.android;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.view.View;
import java.util.Locale;

/** Lightweight native preview: a cached keyframe, target time and seek progress. */
final class ScrubPreviewView extends View {
    private final Paint paint = new Paint(3);
    private final float d;
    private final RectF image=new RectF(), fitted=new RectF();
    private Bitmap bitmap;
    private long target, duration, start;
    private float bottomInset, heightFraction;
    private boolean failed;
    ScrubPreviewView(Context context) {
        super(context); d = getResources().getDisplayMetrics().density;
        setVisibility(GONE); setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
    }
    void begin(long start, long duration, float bottomInset) {
        this.start = start; this.duration = duration; this.bottomInset = bottomInset;
        bitmap = null; failed = false; setVisibility(VISIBLE);
    }
    void progress(long target, float fraction) { this.target = target; heightFraction = fraction; invalidate(); }
    void frame(Bitmap value) { if (value != null) bitmap = value; failed = value == null; invalidate(); }
    void hide() { setVisibility(GONE); bitmap = null; }
    @Override protected void onDraw(Canvas c) {
        float width = getWidth(), height = getHeight();
        float bottom = height-Math.max(24*d,bottomInset+12*d), left = 32*d, right = width-32*d;
        paint.setColor(Color.argb(90,255,255,255)); c.drawRoundRect(left,bottom-4*d,right,bottom,2*d,2*d,paint);
        paint.setColor(Color.WHITE); float x=left+(right-left)*(duration>0 ? (float)target/duration : 0);
        c.drawRoundRect(left,bottom-4*d,x,bottom,2*d,2*d,paint); c.drawCircle(x,bottom-2*d,4*d,paint);
        float w=Math.min(240*d,width-64*d), h=Math.min(w*9/16, Math.max(48*d,height-132*d));
        float panelTop=Math.max(12*d,bottom-h-82*d);
        image.set((width-w)/2,panelTop,(width+w)/2,panelTop+h);
        paint.setColor(Color.argb(225,20,20,20));
        c.drawRoundRect(image.left-8*d,image.top-8*d,image.right+8*d,image.bottom+58*d,14*d,14*d,paint);
        paint.setColor(Color.argb(255,46,46,46)); c.drawRoundRect(image,8*d,8*d,paint);
        if (bitmap != null) {
            float scale=Math.min(w/bitmap.getWidth(),h/bitmap.getHeight());
            float bw=bitmap.getWidth()*scale,bh=bitmap.getHeight()*scale;
            fitted.set(width/2-bw/2,image.centerY()-bh/2,width/2+bw/2,image.centerY()+bh/2);
            c.drawBitmap(bitmap,null,fitted,paint);
        } else {
            paint.setColor(Color.LTGRAY); paint.setTextSize(13*d); paint.setTextAlign(Paint.Align.CENTER);
            c.drawText(failed ? "Preview unavailable" : "Loading preview…",width/2,image.centerY()+4*d,paint);
        }
        paint.setTextAlign(Paint.Align.CENTER); paint.setColor(Color.WHITE); paint.setTextSize(16*d);
        long delta=(target-start)/1000;
        c.drawText(time(target)+"  ("+(delta<0 ? "−" : "+")+time(Math.abs(target-start))+")",width/2,image.bottom+24*d,paint);
        paint.setColor(Color.LTGRAY); paint.setTextSize(12*d);
        c.drawText(heightFraction<.33f ? "Fine scrubbing" : heightFraction>.7f ? "Fast scrubbing" : "Scrubbing",width/2,image.bottom+45*d,paint);
    }
    private static String time(long ms) {
        long s=Math.max(0,ms/1000);
        return s>=3600 ? String.format(Locale.ROOT,"%d:%02d:%02d",s/3600,s/60%60,s%60) : String.format(Locale.ROOT,"%d:%02d",s/60,s%60);
    }
}
