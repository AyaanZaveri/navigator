package app.navigator.android;

import android.app.Dialog;
import android.content.Context;
import android.content.pm.ActivityInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import java.util.Locale;
import java.util.function.Consumer;

/** Non-focusable preview window: real compositor backdrop blur can sample the
 * native video beneath it, unlike a blur of this view's own foreground pixels. */
final class ScrubPreviewPanel {
    private final Dialog dialog;
    private final Window window;
    private final WindowManager manager;
    private final Panel content;
    private final GradientDrawable background=new GradientDrawable();
    private final Consumer<Boolean> blurChanged=this::blur;
    private final float d;
    private boolean listening;
    private int left=-1,top=-1,width=-1,height=-1;

    ScrubPreviewPanel(Context context) {
        d=context.getResources().getDisplayMetrics().density;
        manager=context.getSystemService(WindowManager.class);
        dialog=new Dialog(context,R.style.ScrubPreviewTheme);
        dialog.setCancelable(false);
        content=new Panel(context);
        dialog.setContentView(content,new ViewGroup.LayoutParams(-1,-1));
        window=dialog.getWindow();
        background.setCornerRadius(14*d); background.setColor(Color.argb(230,10,10,10));
        window.setBackgroundDrawable(background);
        window.getDecorView().setPadding(0,0,0,0);
        window.addFlags(WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
            | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN);
        window.clearFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);
        window.setDimAmount(0); WindowCompat.setDecorFitsSystemWindows(window,false);
        if (Build.VERSION.SDK_INT>=26) window.setColorMode(ActivityInfo.COLOR_MODE_DEFAULT);
        dialog.setOnDismissListener(ignored -> removeBlurListener());
    }
    void show(int left,int top,int width,int height) {
        if (this.left!=left || this.top!=top || this.width!=width || this.height!=height) {
            this.left=left; this.top=top; this.width=width; this.height=height;
            var params=window.getAttributes(); params.gravity=Gravity.TOP|Gravity.LEFT;
            params.x=left; params.y=top; params.width=width; params.height=height;
            if (Build.VERSION.SDK_INT>=30) params.setFitInsetsTypes(0);
            window.setAttributes(params);
        }
        if (!dialog.isShowing()) {
            try {
                dialog.show();
                if (Build.VERSION.SDK_INT>=31 && manager!=null && !listening) {
                    listening=true;
                    manager.addCrossWindowBlurEnabledListener(content.getContext().getMainExecutor(),blurChanged);
                    blur(manager.isCrossWindowBlurEnabled());
                }
            } catch (WindowManager.BadTokenException closing) { hide(); }
        }
    }
    private void blur(boolean enabled) {
        background.setColor(Color.argb(enabled ? 178 : 230,10,10,10));
        if (Build.VERSION.SDK_INT>=31) window.setBackgroundBlurRadius(enabled ? Math.round(12*d) : 0);
    }
    private void removeBlurListener() {
        if (Build.VERSION.SDK_INT>=31 && listening && manager!=null) manager.removeCrossWindowBlurEnabledListener(blurChanged);
        listening=false;
    }
    void begin(long start) { content.start=start; content.bitmap=null; content.failed=false; }
    void progress(long target,float fraction) { content.target=target; content.fraction=fraction; content.invalidate(); }
    void frame(Bitmap bitmap) {
        if (bitmap!=null) content.bitmap=bitmap;
        content.failed=bitmap==null; content.invalidate();
    }
    void hide() { removeBlurListener(); if (dialog.isShowing()) dialog.dismiss(); content.bitmap=null; }

    private static final class Panel extends View {
        private final Paint paint=new Paint(3);
        private final RectF image=new RectF(),fitted=new RectF();
        private final Path clip=new Path();
        private final Typeface regular,semibold;
        private final float d;
        private Bitmap bitmap;
        private boolean failed;
        private long start,target;
        private float fraction;
        Panel(Context context) {
            super(context); d=getResources().getDisplayMetrics().density;
            regular=Typeface.createFromAsset(context.getAssets(),"fonts/SunghyunSans-Regular.otf");
            semibold=Typeface.createFromAsset(context.getAssets(),"fonts/SunghyunSans-SemiBold.otf");
            paint.setFontFeatureSettings("tnum");
            setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
        }
        @Override protected void onDraw(Canvas c) {
            image.set(8*d,8*d,getWidth()-8*d,getHeight()-58*d);
            paint.setColor(Color.rgb(46,46,46)); c.drawRoundRect(image,6*d,6*d,paint);
            if (bitmap!=null) {
                float scale=Math.min(image.width()/bitmap.getWidth(),image.height()/bitmap.getHeight());
                float w=bitmap.getWidth()*scale,h=bitmap.getHeight()*scale;
                fitted.set(image.centerX()-w/2,image.centerY()-h/2,image.centerX()+w/2,image.centerY()+h/2);
                clip.reset(); clip.addRoundRect(image,6*d,6*d,Path.Direction.CW);
                int save=c.save(); c.clipPath(clip); c.drawBitmap(bitmap,null,fitted,paint); c.restoreToCount(save);
            } else {
                paint.setTypeface(regular); paint.setColor(Color.LTGRAY); paint.setTextSize(13*d); paint.setTextAlign(Paint.Align.CENTER);
                c.drawText(failed ? "Preview unavailable" : "Loading preview…",getWidth()/2f,image.centerY()+4*d,paint);
            }
            paint.setTextAlign(Paint.Align.CENTER); paint.setTypeface(semibold); paint.setColor(Color.WHITE); paint.setTextSize(16*d);
            c.drawText(time(target)+"  ("+(target<start ? "−" : "+")+time(Math.abs(target-start))+")",
                getWidth()/2f,image.bottom+24*d,paint);
            paint.setTypeface(regular); paint.setColor(Color.LTGRAY); paint.setTextSize(12*d);
            c.drawText(fraction<.33f ? "Fine scrubbing" : fraction>.7f ? "Fast scrubbing" : "Scrubbing",
                getWidth()/2f,image.bottom+45*d,paint);
        }
        private static String time(long ms) {
            long s=Math.max(0,ms/1000);
            return s>=3600 ? String.format(Locale.ROOT,"%d:%02d:%02d",s/3600,s/60%60,s%60)
                : String.format(Locale.ROOT,"%d:%02d",s/60,s%60);
        }
    }
}
