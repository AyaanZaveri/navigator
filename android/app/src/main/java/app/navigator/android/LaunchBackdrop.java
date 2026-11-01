package app.navigator.android;

import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.ColorFilter;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.graphics.RadialGradient;
import android.graphics.Rect;
import android.graphics.Shader;
import android.graphics.drawable.Drawable;
import android.os.Build;
import android.provider.Settings;
import android.view.Gravity;
import android.view.ViewGroup;
import android.view.animation.PathInterpolator;
import android.widget.FrameLayout;
import android.widget.ImageView;

/** Native first-content launch surface. Static Figma-inspired light fields avoid
 * a full-screen animated blur; only the mark's transform and opacity animate. */
final class LaunchBackdrop extends FrameLayout {
    private final ImageView mark;
    private boolean closing;

    LaunchBackdrop(Context context) {
        super(context);
        setBackground(new Aurora());
        setClickable(true);
        mark = new ImageView(context);
        mark.setImageResource(R.drawable.ic_splash_ship);
        mark.setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
        int size = Math.round(288 * getResources().getDisplayMetrics().density);
        addView(mark, new FrameLayout.LayoutParams(size, size, Gravity.CENTER));
    }

    static boolean animationsEnabled(Context context) {
        if (Build.VERSION.SDK_INT >= 26) return ValueAnimator.areAnimatorsEnabled();
        return Settings.Global.getFloat(context.getContentResolver(), Settings.Global.ANIMATOR_DURATION_SCALE, 1f) > 0;
    }

    void dismiss(boolean animated) {
        if (closing) { if (!animated) close(); return; }
        closing = true;
        if (!animated || !animationsEnabled(getContext())) { close(); return; }
        var curve = new PathInterpolator(0.23f, 1f, 0.32f, 1f);
        mark.animate().scaleX(1.08f).scaleY(1.08f).setDuration(220).setInterpolator(curve).start();
        animate().alpha(0).setDuration(220).setInterpolator(curve).withEndAction(this::close).start();
    }

    void close() {
        closing = true;
        mark.animate().cancel();
        animate().cancel();
        if (getParent() instanceof ViewGroup parent) parent.removeView(this);
    }

    private static final class Aurora extends Drawable {
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private Shader base, top, bottom, halo;
        @Override protected void onBoundsChange(Rect bounds) {
            float w=bounds.width(), h=bounds.height(), shortEdge=Math.min(w,h);
            if (shortEdge<=0) return;
            base=new LinearGradient(0,0,w,h,Color.rgb(10,10,10),Color.rgb(4,47,46),Shader.TileMode.CLAMP);
            top=new RadialGradient(w*.5f,h*.05f,shortEdge*.9f,0x8C14B8A6,0x0014B8A6,Shader.TileMode.CLAMP);
            bottom=new RadialGradient(w*.5f,h*1.05f,shortEdge*.95f,0x800D9488,0x000D9488,Shader.TileMode.CLAMP);
            halo=new RadialGradient(w*.5f,h*.5f,shortEdge*.4f,0x2914B8A6,0x0014B8A6,Shader.TileMode.CLAMP);
        }
        @Override public void draw(Canvas canvas) {
            if (base==null) return;
            paint.setShader(base); canvas.drawRect(getBounds(),paint);
            paint.setShader(top); canvas.drawRect(getBounds(),paint);
            paint.setShader(bottom); canvas.drawRect(getBounds(),paint);
            paint.setShader(halo); canvas.drawRect(getBounds(),paint);
        }
        @Override public void setAlpha(int alpha) { paint.setAlpha(alpha); invalidateSelf(); }
        @Override public void setColorFilter(ColorFilter filter) { paint.setColorFilter(filter); invalidateSelf(); }
        @Override public int getOpacity() { return PixelFormat.TRANSLUCENT; }
    }
}
