package app.navigator.android;

import android.annotation.SuppressLint;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.drawable.Drawable;
import android.os.Bundle;
import android.view.MotionEvent;
import android.view.View;
import android.view.accessibility.AccessibilityNodeInfo;
import android.widget.SeekBar;
import java.util.function.Consumer;

/** Transparent slider with official Lucide artwork and a 56dp touch target. */
final class SideControlView extends View {
    private final Paint paint=new Paint(3);
    private final float d;
    private final Drawable sun, silent, quiet, medium, loud;
    private final Consumer<Float> change;
    private final Runnable mute, hold, release;
    private boolean volume, muted, dragging, iconPress;
    private float value;
    private final SliderDrag slider=new SliderDrag();
    private final PlayerBarGlide glide=new PlayerBarGlide(this);
    private final PlayerBarGlide emphasis=new PlayerBarGlide(this);
    SideControlView(Context context,Consumer<Float> change,Runnable mute,Runnable hold,Runnable release) {
        super(context); d=getResources().getDisplayMetrics().density;
        this.change=change; this.mute=mute; this.hold=hold; this.release=release;
        sun=context.getDrawable(R.drawable.lucide_sun);
        silent=context.getDrawable(R.drawable.lucide_volume_x);
        quiet=context.getDrawable(R.drawable.lucide_volume);
        medium=context.getDrawable(R.drawable.lucide_volume_1);
        loud=context.getDrawable(R.drawable.lucide_volume_2);
        setFocusable(true); setClickable(true); setVisibility(GONE);
    }
    void update(boolean volume,float value,float displayValue,boolean muted,boolean tracking) {
        boolean reset=this.volume!=volume || getVisibility()!=VISIBLE;
        this.volume=volume; this.value=value; this.muted=muted;
        if (reset) glide.snap(displayValue);
        else glide.to(tracking ? displayValue : value);
        setContentDescription((volume ? (muted ? "Media volume muted, " : "Media volume, ") : "Brightness, ")
            +Math.round(value*100)+" percent"+(volume ? ". Top icon toggles mute." : ""));
        invalidate();
    }
    @Override protected void onDraw(Canvas canvas) {
        float x=getWidth()/2f,top=44*d,bottom=getHeight()-16*d;
        Drawable icon=!volume ? sun : muted || value<=0 ? silent : value<.34f ? quiet : value<.67f ? medium : loud;
        int radius=Math.round(9*d),centerY=Math.round(22*d),centerX=Math.round(x);
        icon.setBounds(centerX-radius,centerY-radius,centerX+radius,centerY+radius); icon.draw(canvas);
        float halfWidth=(4+emphasis.value())*d;
        paint.setColor(Color.argb(51,255,255,255));
        canvas.drawRoundRect(x-halfWidth,top,x+halfWidth,bottom,halfWidth,halfWidth,paint);
        float at=bottom-(bottom-top)*glide.value();
        paint.setColor(Color.WHITE); canvas.drawRoundRect(x-halfWidth,at,x+halfWidth,bottom,halfWidth,halfWidth,paint);
    }
    private void drag(float y) {
        change.accept(slider.move(y));
    }
    @SuppressLint("ClickableViewAccessibility") // Range actions and mute click are implemented below.
    @Override public boolean onTouchEvent(MotionEvent e) {
        if (e.getActionMasked()==MotionEvent.ACTION_DOWN) {
            iconPress=volume && e.getY()<44*d; dragging=!iconPress;
            hold.run(); slider.begin(value,e.getY(),getHeight()-60*d,0);
            return true;
        }
        if (e.getPointerCount()!=1 || e.getActionMasked()==MotionEvent.ACTION_CANCEL) {
            dragging=iconPress=false; release.run(); return true;
        }
        if (e.getActionMasked()==MotionEvent.ACTION_MOVE && dragging) drag(e.getY());
        if (e.getActionMasked()==MotionEvent.ACTION_UP) {
            if (iconPress && e.getY()<44*d) performClick();
            if (dragging) drag(e.getY());
            dragging=iconPress=false; release.run();
        }
        return true;
    }
    void setHeld(boolean held) { emphasis.to(held && !iconPress ? 1 : 0); }
    void settle() { glide.to(value); setHeld(false); }
    @Override protected void onVisibilityChanged(View changedView,int visibility) {
        super.onVisibilityChanged(changedView,visibility);
        if (visibility!=VISIBLE) {
            // View's constructor can dispatch visibility before fields initialize.
            if (glide!=null) glide.cancel();
            if (emphasis!=null) emphasis.snap(0);
            dragging=iconPress=false;
        }
    }
    @Override protected void onDetachedFromWindow() { glide.cancel(); emphasis.cancel(); super.onDetachedFromWindow(); }
    @Override public boolean performClick() { super.performClick(); if (volume) mute.run(); return true; }
    @Override public void onInitializeAccessibilityNodeInfo(AccessibilityNodeInfo info) {
        super.onInitializeAccessibilityNodeInfo(info); info.setClassName(SeekBar.class.getName());
        info.setRangeInfo(AccessibilityNodeInfo.RangeInfo.obtain(AccessibilityNodeInfo.RangeInfo.RANGE_TYPE_FLOAT,0,1,value));
        info.addAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_SET_PROGRESS);
        info.addAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_SCROLL_FORWARD);
        info.addAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_SCROLL_BACKWARD);
    }
    private void finishAccessibleChange() {
        glide.snap(value); release.run();
    }
    @Override public boolean performAccessibilityAction(int action,Bundle args) {
        if (action==AccessibilityNodeInfo.AccessibilityAction.ACTION_SET_PROGRESS.getId() && args!=null) {
            hold.run(); change.accept(Math.max(0,Math.min(1,args.getFloat(AccessibilityNodeInfo.ACTION_ARGUMENT_PROGRESS_VALUE)))); finishAccessibleChange(); return true;
        }
        if (action==AccessibilityNodeInfo.ACTION_SCROLL_FORWARD || action==AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD) {
            hold.run(); change.accept(Math.max(0,Math.min(1,value+(action==AccessibilityNodeInfo.ACTION_SCROLL_FORWARD ? .05f : -.05f)))); finishAccessibleChange(); return true;
        }
        return super.performAccessibilityAction(action,args);
    }
}
