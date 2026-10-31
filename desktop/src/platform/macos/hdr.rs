// SPDX-License-Identifier: AGPL-3.0-only
// Adapted from AIOStreams c358754b0ae4758d034badf8618de6fdb7fa9333,
// packages/desktop/app/src/platform/macos/video.rs (OpenGL HDR path only).
// See desktop/THIRD-PARTY.md for provenance and modifications.

use crate::{
    hdr::{Video, target_peak},
    mpv::Mpv,
};
use block2::RcBlock;
use dispatch2::{DispatchQueue, DispatchTime};
use objc2::{
    MainThreadMarker,
    rc::Retained,
    runtime::{NSObjectProtocol, ProtocolObject},
};
use objc2_app_kit::{NSApplicationDidChangeScreenParametersNotification, NSScreen, NSView};
use objc2_core_foundation::CFString;
use objc2_core_graphics::CGColorSpace;
use objc2_foundation::{NSNotification, NSNotificationCenter, NSOperationQueue};
use objc2_quartz_core::CAOpenGLLayer;
use std::{cell::RefCell, ptr::NonNull, sync::Arc, time::Duration};

#[derive(Clone, Copy, PartialEq, Eq)]
struct Applied {
    video: Video,
    peak: u32,
}

#[derive(Default)]
struct State {
    mpv: Option<Arc<Mpv>>,
    layer: Option<Retained<CAOpenGLLayer>>,
    view: Option<Retained<NSView>>,
    float_surface: bool,
    video: Option<Video>,
    applied: Option<Applied>,
    generation: u64,
    refresh_pending: bool,
    observer: Option<Retained<ProtocolObject<dyn NSObjectProtocol>>>,
}

thread_local! { static STATE: RefCell<State> = RefCell::default(); }

pub fn attach(
    layer: Retained<CAOpenGLLayer>,
    view: Retained<NSView>,
    mpv: Arc<Mpv>,
    float_surface: bool,
) {
    let block = RcBlock::new(|_: NonNull<NSNotification>| refresh());
    // AppKit notifications are observed only on the main queue.
    let observer = unsafe {
        NSNotificationCenter::defaultCenter().addObserverForName_object_queue_usingBlock(
            Some(NSApplicationDidChangeScreenParametersNotification),
            None,
            Some(&NSOperationQueue::mainQueue()),
            &block,
        )
    };
    STATE.with_borrow_mut(|s| {
        s.layer = Some(layer);
        s.view = Some(view);
        s.mpv = Some(mpv);
        s.float_surface = float_surface;
        s.observer = Some(observer);
    });
    if !float_surface {
        log::warn!("HDR unavailable: using an 8-bit OpenGL surface; keeping SDR tone mapping");
    }
}

/// The worker reads mpv's metadata; all Core Animation work stays on the main queue.
pub fn update(gamma: Option<String>, primaries: Option<String>) {
    DispatchQueue::main().exec_async(move || {
        let video = Video::from_metadata(gamma.as_deref(), primaries.as_deref());
        let (wait, generation) = STATE.with_borrow_mut(|s| {
            s.generation = s.generation.wrapping_add(1);
            let wait = video.is_none() && s.applied.is_some();
            s.video = video;
            (wait, s.generation)
        });
        // Retain EDR through short gaps between files, as AIOStreams does.
        if wait {
            after(Duration::from_millis(1500), move || {
                if STATE.with_borrow(|s| s.generation) == generation {
                    apply();
                }
            });
        } else {
            apply();
        }
    });
}

/// Coalesce window/display/brightness changes without polling every video frame.
pub fn refresh() {
    let queued = STATE.with_borrow_mut(|s| std::mem::replace(&mut s.refresh_pending, true));
    if !queued {
        after(Duration::from_millis(250), || {
            STATE.with_borrow_mut(|s| s.refresh_pending = false);
            apply();
        });
    }
}

fn after(delay: Duration, work: impl FnOnce() + Send + 'static) {
    if let Ok(when) = DispatchTime::try_from(delay) {
        let _ = DispatchQueue::main().after(when, work);
    }
}

fn apply() {
    let view = STATE.with_borrow(|s| s.view.clone());
    let screen = view
        .as_deref()
        .and_then(|v| v.window())
        .and_then(|w| w.screen())
        .or_else(|| MainThreadMarker::new().and_then(NSScreen::mainScreen));
    let (current, potential) = screen.map_or((1.0, 1.0), |s| {
        (
            s.maximumExtendedDynamicRangeColorComponentValue(),
            s.maximumPotentialExtendedDynamicRangeColorComponentValue(),
        )
    });
    STATE.with_borrow_mut(|s| {
        log::debug!(
            "HDR display current={current:.2} potential={potential:.2} float={} video={:?}",
            s.float_surface,
            s.video
        );
        let peak = target_peak(
            current,
            potential,
            s.float_surface,
            s.applied.map(|a| a.peak),
        );
        match s.video.zip(peak) {
            Some((video, peak)) => s.switch_on(Applied { video, peak }),
            None => s.switch_off(),
        }
    });
}

impl State {
    fn switch_on(&mut self, want: Applied) {
        if self.applied == Some(want) {
            return;
        }
        let (Some(layer), Some(mpv)) = (self.layer.clone(), self.mpv.clone()) else {
            return;
        };
        if self.applied.is_none_or(|old| old.video != want.video) {
            self.switch_off();
            let name = CFString::from_static_str(want.video.colorspace);
            let Some(space) = CGColorSpace::with_name(Some(&name)) else {
                log::warn!("HDR colorspace unavailable; keeping SDR output");
                return;
            };
            layer.setColorspace(Some(&space));
            layer.setWantsExtendedDynamicRangeContent(true);
            // HLG/PQ input is rendered as PQ; an ICC profile would turn it back into SDR.
            for (name, value) in [
                ("target-prim", want.video.primaries),
                ("target-trc", "pq"),
                ("icc-profile", ""),
            ] {
                set(&mpv, name, value);
            }
        }
        set(&mpv, "target-peak", &want.peak.to_string());
        log::info!(
            "HDR on primaries={} target-peak={}",
            want.video.primaries,
            want.peak
        );
        self.applied = Some(want);
    }

    fn switch_off(&mut self) {
        if self.applied.take().is_none() {
            return;
        }
        if let Some(layer) = &self.layer {
            layer.setWantsExtendedDynamicRangeContent(false);
            layer.setColorspace(None);
        }
        if let Some(mpv) = &self.mpv {
            for name in ["target-prim", "target-trc", "target-peak"] {
                set(mpv, name, "auto");
            }
        }
        log::info!("HDR off: SDR output restored");
    }
}

fn set(mpv: &Mpv, name: &str, value: &str) {
    // A render API's main thread must never block on mpv's dispatch lock.
    if let Err(error) = mpv.set_property_async(name, value) {
        log::warn!("HDR mpv {name}={value}: {error}");
    }
}

pub fn shutdown() {
    STATE.with_borrow_mut(|s| {
        s.switch_off();
        if let Some(observer) = s.observer.take() {
            unsafe {
                NSNotificationCenter::defaultCenter().removeObserver((*observer).as_ref());
            }
        }
        *s = State::default();
    });
}

/// Native integration-check state; never exposed through the web bridge.
pub fn diagnostics() -> (bool, f64, bool, bool) {
    STATE.with_borrow(|s| {
        let potential = s
            .view
            .as_deref()
            .and_then(|v| v.window())
            .and_then(|w| w.screen())
            .map_or(1.0, |screen| {
                screen.maximumPotentialExtendedDynamicRangeColorComponentValue()
            });
        let active = s
            .layer
            .as_ref()
            .is_some_and(|layer| layer.wantsExtendedDynamicRangeContent());
        let configured = s.applied.is_some()
            && s.layer
                .as_ref()
                .is_some_and(|layer| layer.colorspace().is_some());
        (s.float_surface, potential, active, configured)
    })
}
