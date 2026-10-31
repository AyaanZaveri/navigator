package app.navigator.android;

import android.annotation.SuppressLint;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.os.Bundle;
import android.view.MotionEvent;
import android.view.View;
import android.view.accessibility.AccessibilityNodeInfo;
import android.widget.SeekBar;
import java.util.function.Consumer;

/** Thin progress-style slider with a 56dp drag target and a separate mute target. */
final class SideControlView extends View {
    private final Paint paint = new Paint(3);
    private final float d;
    private final Path path = new Path();
    private final Consumer<Float> change;
    private final Runnable mute, hold, release;
    private boolean volume, muted, dragging, mutePress;
    private float value;
    SideControlView(Context context, Consumer<Float> change, Runnable mute, Runnable hold, Runnable release) {
        super(context); d = getResources().getDisplayMetrics().density;
        this.change = change; this.mute = mute; this.hold = hold; this.release = release;
        setFocusable(true); setClickable(true); setVisibility(GONE);
    }
    void update(boolean volume, float value, boolean muted) {
        this.volume = volume; this.value = value; this.muted = muted;
        setContentDescription((volume ? (muted ? "Media volume muted, " : "Media volume, ") : "Brightness, ")
            + Math.round(value * 100) + " percent" + (volume ? ". Bottom button toggles mute." : ""));
        invalidate();
    }
    @Override protected void onDraw(Canvas canvas) {
        float w = getWidth(), h = getHeight(), x = w / 2, top = 50*d, bottom = h - 54*d;
        // Transparent surface; match the timeline's white fill and 20% track.
        paint.setStyle(Paint.Style.FILL); paint.setColor(Color.WHITE); paint.setStrokeWidth(1.8f*d); paint.setStrokeCap(Paint.Cap.ROUND);
        if (volume) speaker(canvas, x, 26*d, false);
        else {
            paint.setStyle(Paint.Style.STROKE); canvas.drawCircle(x, 26*d, 5*d, paint);
            for (int i=0; i<8; i++) {
                double a = i * Math.PI/4;
                canvas.drawLine(x+(float)Math.cos(a)*9*d, 26*d+(float)Math.sin(a)*9*d,
                    x+(float)Math.cos(a)*12*d, 26*d+(float)Math.sin(a)*12*d, paint);
            }
        }
        paint.setStyle(Paint.Style.FILL); paint.setColor(Color.argb(51,255,255,255));
        canvas.drawRoundRect(x-3*d, top, x+3*d, bottom, 3*d, 3*d, paint);
        float at = bottom - (bottom-top)*value;
        paint.setColor(Color.WHITE); canvas.drawRoundRect(x-3*d, at, x+3*d, bottom, 3*d, 3*d, paint);
        if (volume) { paint.setStrokeWidth(1.8f*d); speaker(canvas, x, h-24*d, muted || value == 0); }
    }
    private void speaker(Canvas c, float x, float y, boolean crossed) {
        paint.setStyle(Paint.Style.STROKE);
        path.reset(); path.moveTo(x-10*d,y-3*d); path.lineTo(x-6*d,y-3*d);
        path.lineTo(x,y-8*d); path.lineTo(x,y+8*d); path.lineTo(x-6*d,y+3*d);
        path.lineTo(x-10*d,y+3*d); path.close(); c.drawPath(path,paint);
        if (crossed) {
            c.drawLine(x+4*d,y-4*d,x+11*d,y+4*d,paint); c.drawLine(x+4*d,y+4*d,x+11*d,y-4*d,paint);
        } else {
            c.drawArc(x-3*d,y-8*d,x+10*d,y+8*d,-55,110,false,paint);
            c.drawArc(x-6*d,y-12*d,x+15*d,y+12*d,-50,100,false,paint);
        }
        paint.setStyle(Paint.Style.FILL);
    }
    private void drag(float y) { change.accept(Math.max(volume ? 0 : .02f, Math.min(1, (getHeight()-54*d-y)/(getHeight()-104*d)))); }
    @SuppressLint("ClickableViewAccessibility") // Implements slider actions and click below for assistive technology.
    @Override public boolean onTouchEvent(MotionEvent e) {
        if (e.getActionMasked() == MotionEvent.ACTION_DOWN) {
            hold.run(); mutePress = volume && e.getY() >= getHeight()-48*d; dragging = !mutePress;
            if (dragging) drag(e.getY()); return true;
        }
        if (e.getPointerCount() != 1 || e.getActionMasked() == MotionEvent.ACTION_CANCEL) {
            dragging = mutePress = false; release.run(); return true;
        }
        if (e.getActionMasked() == MotionEvent.ACTION_MOVE && dragging) drag(e.getY());
        if (e.getActionMasked() == MotionEvent.ACTION_UP) {
            if (mutePress && e.getY() >= getHeight()-48*d) performClick();
            dragging = mutePress = false; release.run();
        }
        return true;
    }
    @Override public boolean performClick() { super.performClick(); if (volume) mute.run(); return true; }
    @Override public void onInitializeAccessibilityNodeInfo(AccessibilityNodeInfo info) {
        super.onInitializeAccessibilityNodeInfo(info); info.setClassName(SeekBar.class.getName());
        info.setRangeInfo(AccessibilityNodeInfo.RangeInfo.obtain(AccessibilityNodeInfo.RangeInfo.RANGE_TYPE_FLOAT, 0, 1, value));
        info.addAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_SET_PROGRESS);
        info.addAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_SCROLL_FORWARD);
        info.addAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_SCROLL_BACKWARD);
    }
    @Override public boolean performAccessibilityAction(int action, Bundle args) {
        if (action == AccessibilityNodeInfo.AccessibilityAction.ACTION_SET_PROGRESS.getId() && args != null) {
            change.accept(Math.max(0,Math.min(1,args.getFloat(AccessibilityNodeInfo.ACTION_ARGUMENT_PROGRESS_VALUE)))); return true;
        }
        if (action == AccessibilityNodeInfo.ACTION_SCROLL_FORWARD || action == AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD) {
            change.accept(Math.max(0,Math.min(1,value+(action == AccessibilityNodeInfo.ACTION_SCROLL_FORWARD ? .05f : -.05f)))); return true;
        }
        return super.performAccessibilityAction(action,args);
    }
}
