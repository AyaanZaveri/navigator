//! Bounded, session-scoped RGBA delivery from GPU readback to WebView shared memory.
#[cfg(windows)]
mod sampling {
    use serde_json::{Value, json};
    use std::{
        sync::{
            Arc, Condvar, Mutex,
            atomic::{AtomicBool, Ordering},
        },
        thread::JoinHandle,
    };

    #[derive(Clone, PartialEq, Eq)]
    pub struct Ticket {
        pub session: String,
        pub revision: u64,
    }
    pub struct Frame {
        pub ticket: Ticket,
        pub pixels: Vec<u8>,
        pub width: usize,
        pub height: usize,
        pub stride: usize,
        pub captured: std::time::Instant,
    }
    struct State {
        session: String,
        active: bool,
        revision: u64,
        visible: bool,
        frame: Option<Frame>,
        prepared: Option<Frame>,
        wake: Option<Arc<dyn Fn() + Send + Sync>>,
    }
    #[derive(Clone)]
    pub struct Control(Arc<(Mutex<State>, Condvar)>);
    impl Control {
        fn change(&self, update: impl FnOnce(&mut State) -> bool) {
            let wake = {
                let mut s = self.0.0.lock().unwrap();
                if !update(&mut s) {
                    return;
                }
                s.revision += 1;
                s.frame = None;
                s.prepared = None;
                s.wake.clone()
            };
            self.0.1.notify_all();
            if let Some(wake) = wake {
                wake();
            }
        }
        pub fn source(&self, session: String) {
            self.change(|s| {
                s.session = session;
                s.active = false;
                true
            });
        }
        pub fn demand(&self, session: &str, active: bool) {
            self.change(|s| {
                if s.session != session || s.active == active {
                    return false;
                }
                s.active = active;
                true
            });
        }
        pub fn visible(&self, visible: bool) {
            self.change(|s| {
                if s.visible == visible {
                    return false;
                }
                s.visible = visible;
                true
            });
        }
        pub fn invalidate(&self) {
            self.change(|_| true);
        }
        pub fn on_demand(&self, wake: Arc<dyn Fn() + Send + Sync>) {
            self.0.0.lock().unwrap().wake = Some(wake);
        }
        pub fn ticket(&self) -> Option<Ticket> {
            let s = self.0.0.lock().unwrap();
            (s.active && s.visible && !s.session.is_empty()).then(|| Ticket {
                session: s.session.clone(),
                revision: s.revision,
            })
        }
        pub fn take(&self) -> Option<Frame> {
            let mut s = self.0.0.lock().unwrap();
            let frame = s.prepared.take()?;
            (s.active
                && s.visible
                && s.session == frame.ticket.session
                && s.revision == frame.ticket.revision)
                .then_some(frame)
        }
        pub fn submit(
            &self,
            ticket: Ticket,
            pixels: Vec<u8>,
            width: usize,
            height: usize,
            stride: usize,
            captured: std::time::Instant,
        ) {
            let mut s = self.0.0.lock().unwrap();
            if s.active && s.visible && s.session == ticket.session && s.revision == ticket.revision
            {
                s.frame = Some(Frame {
                    ticket,
                    pixels,
                    width,
                    height,
                    stride,
                    captured,
                });
                self.0.1.notify_one();
            }
        }
    }
    pub struct Sampler {
        pub control: Control,
        worker: Option<JoinHandle<()>>,
        quit: Arc<AtomicBool>,
    }
    impl Sampler {
        pub fn start(
            emit: Arc<dyn Fn(Value) + Send + Sync>,
            quit: Arc<AtomicBool>,
        ) -> Result<Self, String> {
            let control = Control(Arc::new((
                Mutex::new(State {
                    session: String::new(),
                    active: false,
                    revision: 0,
                    visible: true,
                    frame: None,
                    prepared: None,
                    wake: None,
                }),
                Condvar::new(),
            )));
            let shared = control.clone();
            let stopped = quit.clone();
            let worker = std::thread::Builder::new()
                .name("navigator-glass-delivery".into())
                .spawn(move || {
                    while !quit.load(Ordering::Relaxed) {
                        let frame = {
                            let mut s = shared.0.0.lock().unwrap();
                            while s.frame.is_none() && !quit.load(Ordering::Relaxed) {
                                s = shared.0.1.wait(s).unwrap();
                            }
                            s.frame.take()
                        };
                        let Some(frame) = frame else {
                            continue;
                        };
                        // The sampling shader writes RGBA byte order directly.
                        log::trace!(
                            "glass RGBA prepared in {:.2} ms",
                            frame.captured.elapsed().as_secs_f64() * 1000.0
                        );
                        let session = frame.ticket.session.clone();
                        let notify = {
                            let mut s = shared.0.0.lock().unwrap();
                            if !s.active
                                || !s.visible
                                || s.session != frame.ticket.session
                                || s.revision != frame.ticket.revision
                            {
                                continue;
                            }
                            s.prepared.replace(frame).is_none()
                        };
                        if notify && !quit.load(Ordering::Relaxed) {
                            emit(json!({"type":"glass-frame","session":session}));
                        }
                    }
                })
                .map_err(|e| e.to_string())?;
            Ok(Self {
                control,
                worker: Some(worker),
                quit: stopped,
            })
        }
        pub fn wake(&self) {
            let _s = self.control.0.0.lock().unwrap();
            self.control.0.1.notify_all();
        }
        pub fn finished(&self) -> bool {
            self.worker.as_ref().is_none_or(|w| w.is_finished())
        }
        pub fn join(&mut self) {
            if let Some(w) = self.worker.take() {
                let _ = w.join();
            }
        }
    }
    #[cfg(test)]
    mod tests {
        use super::*;
        #[test]
        fn stale_gpu_copy_cannot_cross_sources_or_visibility() {
            let (tx, rx) = std::sync::mpsc::channel();
            let sampler = Sampler::start(
                Arc::new(move |value| {
                    let _ = tx.send(value);
                }),
                Arc::new(AtomicBool::new(false)),
            )
            .unwrap();
            let control = &sampler.control;
            control.source("old".into());
            control.demand("old", true);
            let old = control.ticket().unwrap();
            control.source("new".into());
            control.demand("new", true);
            let current = control.ticket().unwrap();
            control.submit(old, vec![9, 9, 9, 255], 1, 1, 4, std::time::Instant::now());
            control.submit(
                current.clone(),
                vec![1, 2, 3, 255],
                1,
                1,
                4,
                std::time::Instant::now(),
            );
            assert_eq!(
                rx.recv_timeout(std::time::Duration::from_secs(1)).unwrap()["session"],
                "new"
            );
            let frame = control.take().unwrap();
            assert_eq!(frame.pixels, vec![1, 2, 3, 255]);
            control.visible(false);
            control.submit(
                current,
                vec![4, 5, 6, 255],
                1,
                1,
                4,
                std::time::Instant::now(),
            );
            assert!(control.take().is_none());
        }
    }
    impl Drop for Sampler {
        fn drop(&mut self) {
            self.quit.store(true, Ordering::Relaxed);
            self.wake();
            self.join();
        }
    }
}
#[cfg(windows)]
pub use sampling::{Control, Frame, Sampler, Ticket};
