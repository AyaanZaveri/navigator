//! Demand-driven, bounded glass samples. Playback stays in the native surface;
//! only a 160x90 (maximum) bitmap reaches visible material surfaces at <=30 Hz.

/// Downsample BGR0 to a top-down 24-bit BMP without codecs, temporary files or a
/// second decoder. Keep this pure function testable without a GPU or libmpv.
pub fn bitmap(pixels: &[u8], width: usize, height: usize, stride: usize) -> Result<Vec<u8>, String> {
    if width == 0 || height == 0 || width > 16384 || height > 16384 || stride < width*4
        || (height-1).checked_mul(stride).and_then(|n| n.checked_add(width*4)).is_none_or(|n| n > pixels.len()) {
        return Err("Invalid glass bitmap layout".into());
    }
    let scale = (160.0 / width as f64).min(90.0 / height as f64).min(1.0);
    let w = (width as f64 * scale).round().max(1.0) as usize;
    let h = (height as f64 * scale).round().max(1.0) as usize;
    let row = (w * 3).next_multiple_of(4);
    let mut bmp = vec![0u8; 54 + row*h];
    let size = bmp.len() as u32;
    bmp[..2].copy_from_slice(b"BM");
    bmp[2..6].copy_from_slice(&size.to_le_bytes());
    bmp[10..14].copy_from_slice(&54u32.to_le_bytes());
    bmp[14..18].copy_from_slice(&40u32.to_le_bytes());
    bmp[18..22].copy_from_slice(&(w as i32).to_le_bytes());
    bmp[22..26].copy_from_slice(&(-(h as i32)).to_le_bytes());
    bmp[26..28].copy_from_slice(&1u16.to_le_bytes());
    bmp[28..30].copy_from_slice(&24u16.to_le_bytes());
    for y in 0..h {
        let sy = ((y*2+1)*height/(h*2)).min(height-1);
        for x in 0..w {
            let sx = ((x*2+1)*width/(w*2)).min(width-1);
            let from = sy*stride + sx*4;
            let to = 54 + y*row + x*3;
            bmp[to..to+3].copy_from_slice(&pixels[from..from+3]);
        }
    }
    Ok(bmp)
}

#[cfg(windows)]
mod sampling {
    use crate::mpv::{Kind, Mpv};
    use base64::{Engine, engine::general_purpose::STANDARD};
    use serde_json::{Value, json};
    use std::{sync::{Arc, Mutex, Condvar, atomic::{AtomicBool, Ordering}}, thread::JoinHandle, time::{Duration, Instant}};
    #[derive(Default)]
    struct State { session: String, active: bool, revision: u64, visible: bool }
    #[derive(Clone)]
    pub struct Control(Arc<(Mutex<State>, Condvar)>);
    impl Control {
        pub fn source(&self, session: String) { let mut s=self.0.0.lock().unwrap(); s.session=session;s.active=false;s.revision+=1;self.0.1.notify_all(); }
        pub fn demand(&self, session: &str, active: bool) { let mut s=self.0.0.lock().unwrap();if s.session==session && s.active!=active{s.active=active;s.revision+=1;self.0.1.notify_all();} }
        pub fn visible(&self, visible: bool) {let mut s=self.0.0.lock().unwrap();if s.visible!=visible{s.visible=visible;s.revision+=1;self.0.1.notify_all();}}
        pub fn invalidate(&self) {self.0.0.lock().unwrap().revision+=1;self.0.1.notify_all();}
    }
    pub struct Sampler { pub control: Control, worker: Option<JoinHandle<()>>, quit: Arc<AtomicBool> }
    impl Sampler {
        pub fn start(mpv: Arc<Mpv>, emit: Arc<dyn Fn(Value)+Send+Sync>, quit: Arc<AtomicBool>) -> Result<Self,String> {
            let control=Control(Arc::new((Mutex::new(State{visible:true,..State::default()}),Condvar::new())));
            let shared=control.clone();
            let stopped=quit.clone();
            let worker=std::thread::Builder::new().name("navigator-glass".into()).spawn(move||{
                let period=Duration::from_secs_f64(1.0/30.0);
                let mut next=Instant::now();
                let mut previous=None;
                let mut attempted_revision=None;
                let mut sampled=0u64;
                let mut capture_time=Duration::ZERO;
                let mut report=Instant::now();
                while !quit.load(Ordering::Relaxed) {
                    let (session,revision)={
                        let mut s=shared.0.0.lock().unwrap();
                        loop {
                            if quit.load(Ordering::Relaxed) { break; }
                            if !(s.active&&s.visible&&!s.session.is_empty()) {
                                s=shared.0.1.wait(s).unwrap();
                            } else if attempted_revision!=Some(s.revision) || Instant::now()>=next {
                                break;
                            } else {
                                s=shared.0.1.wait_timeout(s,next.saturating_duration_since(Instant::now())).unwrap().0;
                            }
                        }
                        if quit.load(Ordering::Relaxed) { break; }
                        (s.session.clone(),s.revision)
                    };
                    {
                        let started=Instant::now();
                        attempted_revision=Some(revision);
                        next=started+period;
                        let position=mpv.get_property("time-pos",Kind::Double).and_then(|v|v.as_f64()).map(f64::to_bits);
                        let key=(revision,position);
                        // A paused frame stays cached; geometry changes invalidate it.
                        if previous!=Some(key) {
                            if let Ok(bitmap)=mpv.glass_bitmap() {
                                sampled+=1;
                                capture_time+=started.elapsed();
                                let s=shared.0.0.lock().unwrap();
                                if s.active&&s.visible&&s.session==session&&s.revision==revision&&!quit.load(Ordering::Relaxed) {
                                    emit(json!({"type":"glass-frame","session":session,"src":format!("data:image/bmp;base64,{}",STANDARD.encode(bitmap))}));
                                    previous=Some(key);
                                }
                            }
                        }
                        // Diagnostics are disabled at normal log levels. This
                        // measures GPU readback as well as BMP downsampling.
                        if report.elapsed()>=Duration::from_secs(2) && sampled>0 {
                            log::debug!("glass: {sampled} samples, mean capture {:.2} ms, dropped video frames {:?}", capture_time.as_secs_f64()*1000.0/sampled as f64, mpv.get_property("frame-drop-count",Kind::Double));
                            sampled=0;capture_time=Duration::ZERO;report=Instant::now();
                        }
                    }
                }
            }).map_err(|e|e.to_string())?;
            Ok(Self{control,worker:Some(worker),quit:stopped})
        }
        pub fn wake(&self) { let _guard=self.control.0.0.lock().unwrap();self.control.0.1.notify_all(); }
        pub fn finished(&self)->bool{self.worker.as_ref().is_none_or(|w|w.is_finished())}
        pub fn join(&mut self){if let Some(w)=self.worker.take(){let _=w.join();}}
    }
    impl Drop for Sampler { fn drop(&mut self) { self.quit.store(true,Ordering::Relaxed); self.wake(); self.join(); } }
}
#[cfg(windows)]
pub use sampling::Sampler;

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn padded_bgr_rows_become_small_top_down_bmp() {
        let mut pixels=vec![0;24]; pixels[0..4].copy_from_slice(&[1,2,3,255]);pixels[12..16].copy_from_slice(&[4,5,6,255]);
        let b=bitmap(&pixels,2,2,12).unwrap();
        assert_eq!(&b[..2],b"BM");assert_eq!(i32::from_le_bytes(b[22..26].try_into().unwrap()),-2);
        assert_eq!(&b[54..57],&[1,2,3]);assert_eq!(&b[62..65],&[4,5,6]);
        assert!(bitmap(&pixels,2,3,12).is_err());assert!(bitmap(&pixels,2,2,4).is_err());
    }
    #[test]
    fn large_frames_have_a_bounded_bridge_payload() {
        let pixels=vec![37;1920*1080*4];let b=bitmap(&pixels,1920,1080,1920*4).unwrap();
        assert_eq!(i32::from_le_bytes(b[18..22].try_into().unwrap()),160);
        assert_eq!(i32::from_le_bytes(b[22..26].try_into().unwrap()),-90);
        assert!(b.len()*4/3+128 < 64*1024);
    }
}
