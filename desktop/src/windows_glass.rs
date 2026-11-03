//! A bounded, read-only WebView2 shared-memory ring. Each slot stays immutable
//! until JS has copied it into its canvas and acknowledged the exact sequence.
use crate::{glass::Frame, protocol};
use std::{
    sync::atomic::{AtomicU64, Ordering},
    time::Instant,
};
use webview2_com::Microsoft::Web::WebView2::Win32::*;
use windows::core::{Interface, PCWSTR, PWSTR};
use wry::{WebView, WebViewExtWindows};

const CAPACITY: usize = 640 * 360 * 4;
static SEQUENCE: AtomicU64 = AtomicU64::new(1);
struct Slot {
    buffer: ICoreWebView2SharedBuffer,
    busy: Option<(u64, Instant)>,
}
pub struct SharedGlass {
    origin: String,
    slots: Vec<Slot>,
    pending: Option<Frame>,
    ages: Vec<f64>,
    report: Instant,
}
impl SharedGlass {
    pub fn new(origin: String) -> Self {
        Self {
            origin,
            slots: Vec::new(),
            pending: None,
            ages: Vec::new(),
            report: Instant::now(),
        }
    }
    pub fn offer(&mut self, frame: Frame) {
        self.pending = Some(frame);
    }
    pub fn consumed(&mut self, slot: u32, sequence: u64) {
        if let Some(slot) = self.slots.get_mut(slot as usize) {
            if slot.busy.as_ref().is_some_and(|(seq, _)| *seq == sequence) {
                let (_, captured) = slot.busy.take().unwrap();
                self.ages.push(captured.elapsed().as_secs_f64() * 1000.0);
            }
        }
    }
    pub fn flush(&mut self, view: &WebView, control: &crate::glass::Control) -> Result<(), String> {
        let Some(frame) = self.pending.as_ref() else {
            return Ok(());
        };
        if control.ticket().as_ref() != Some(&frame.ticket) {
            self.pending = None;
            return Ok(());
        }
        unsafe { self.send(view) }.map_err(|e| e.to_string())
    }
    unsafe fn send(&mut self, view: &WebView) -> windows::core::Result<()> {
        unsafe {
            let web = view.webview();
            let mut source = PWSTR::null();
            web.Source(&mut source)?;
            let url = source.to_string();
            windows::Win32::System::Com::CoTaskMemFree(Some(source.0.cast()));
            if protocol::origin(&url?).as_deref() != Some(self.origin.as_str()) {
                self.pending = None;
                return Ok(());
            }
            let extended: ICoreWebView2_17 = web.cast()?;
            if self.slots.is_empty() {
                let environment: ICoreWebView2Environment12 = view.environment().cast()?;
                for id in 0..3 {
                    let buffer = environment.CreateSharedBuffer(CAPACITY as u64)?;
                    let metadata = wide(
                        &serde_json::json!({"type":"navigator-glass-buffer","slot":id}).to_string(),
                    );
                    extended.PostSharedBufferToScript(
                        &buffer,
                        COREWEBVIEW2_SHARED_BUFFER_ACCESS_READ_ONLY,
                        PCWSTR(metadata.as_ptr()),
                    )?;
                    self.slots.push(Slot { buffer, busy: None });
                }
            }
            let Some(id) = self.slots.iter().position(|slot| slot.busy.is_none()) else {
                return Ok(());
            };
            let frame = self.pending.take().unwrap();
            let length = frame.width * frame.height * 4;
            if length > CAPACITY || frame.pixels.len() != length || frame.stride != frame.width * 4
            {
                return Ok(());
            }
            log::trace!(
                "shared glass native copy starts at {:.2} ms",
                frame.captured.elapsed().as_secs_f64() * 1000.0
            );
            let slot = &mut self.slots[id];
            let mut address = std::ptr::null_mut();
            slot.buffer.Buffer(&mut address)?;
            std::ptr::copy_nonoverlapping(frame.pixels.as_ptr(), address, length);
            let sequence = SEQUENCE.fetch_add(1, Ordering::Relaxed);
            slot.busy = Some((sequence, frame.captured));
            let metadata=wide(&serde_json::json!({"type":"navigator-glass-frame","slot":id,"sequence":sequence,"session":frame.ticket.session,"width":frame.width,"height":frame.height}).to_string());
            if let Err(error) = web.PostWebMessageAsJson(PCWSTR(metadata.as_ptr())) {
                slot.busy = None;
                return Err(error);
            }
            if self.report.elapsed().as_secs_f32() > 2.0 && !self.ages.is_empty() {
                self.ages.sort_by(f64::total_cmp);
                let p95 = self.ages[(self.ages.len() * 95 / 100).min(self.ages.len() - 1)];
                log::debug!(
                    "Shared glass: {} consumed, p95 GPU-copy-to-canvas-ack {:.1} ms",
                    self.ages.len(),
                    p95
                );
                self.ages.clear();
                self.report = Instant::now();
            }
            Ok(())
        }
    }
}
impl Drop for SharedGlass {
    fn drop(&mut self) {
        for slot in &self.slots {
            let _ = unsafe { slot.buffer.Close() };
        }
    }
}
fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(Some(0)).collect()
}
