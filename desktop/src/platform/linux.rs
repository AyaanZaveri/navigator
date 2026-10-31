// SPDX-License-Identifier: AGPL-3.0-only
// Adapted from Viren070/AIOStreams, commit c358754b0ae4758d034badf8618de6fdb7fa9333.
// See desktop/THIRD-PARTY.md for provenance and modifications.
use crate::mpv::Mpv;
use crate::render::{NativeDisplay, RenderContext};
use gtk4::{glib, prelude::*};
use libloading::Library;
use std::cell::RefCell;
use std::ffi::{c_char, c_int, c_void};
use std::rc::Rc;
use std::sync::{Arc, OnceLock};
use std::time::Duration;
type ProcFn = unsafe extern "C" fn(*const c_char) -> *mut c_void;

/// OpenGL's function lookup, through EGL or GLX, whichever GTK made current.
struct Gl {
    egl_get_proc: Option<ProcFn>,
    egl_current: Option<unsafe extern "C" fn() -> *mut c_void>,
    glx_get_proc: Option<ProcFn>,
    _libs: Vec<Library>,
}

fn gl() -> &'static Gl {
    static GL: OnceLock<Gl> = OnceLock::new();
    GL.get_or_init(|| {
        // SAFETY: system libraries whose initialisers do not depend on us.
        let egl = unsafe { Library::new("libEGL.so.1") }.ok();
        let glx = unsafe { Library::new("libGL.so.1") }.ok();
        // SAFETY: the types match egl.h and glx.h.
        let sym = |lib: &Option<Library>, name: &[u8]| unsafe {
            lib.as_ref()
                .and_then(|l| l.get::<ProcFn>(name).ok().map(|s| *s))
        };
        Gl {
            egl_get_proc: sym(&egl, b"eglGetProcAddress\0"),
            egl_current: unsafe {
                egl.as_ref().and_then(|l| {
                    l.get::<unsafe extern "C" fn() -> *mut c_void>(b"eglGetCurrentContext\0")
                        .ok()
                        .map(|s| *s)
                })
            },
            glx_get_proc: sym(&glx, b"glXGetProcAddressARB\0"),
            _libs: egl.into_iter().chain(glx).collect(),
        }
    })
}

unsafe extern "C" fn get_proc_address(_ctx: *mut c_void, name: *const c_char) -> *mut c_void {
    let gl = gl();
    // SAFETY: plain lookups with the name mpv passed.
    unsafe {
        if let (Some(current), Some(get)) = (gl.egl_current, gl.egl_get_proc) {
            if !current().is_null() {
                return get(name);
            }
        }
        gl.glx_get_proc
            .map_or(std::ptr::null_mut(), |get| get(name))
    }
}

/// The framebuffer GTK bound for this frame; a GLArea draws into its own.
fn current_fbo() -> i32 {
    const DRAW_FRAMEBUFFER_BINDING: u32 = 0x8CA6;
    type GetIntegerv = unsafe extern "C" fn(u32, *mut c_int);
    // SAFETY: looked up for the current context, with glGetIntegerv's type.
    unsafe {
        let f = get_proc_address(std::ptr::null_mut(), c"glGetIntegerv".as_ptr());
        if f.is_null() {
            return 0;
        }
        let get: GetIntegerv = std::mem::transmute(f);
        let mut fbo: c_int = 0;
        get(DRAW_FRAMEBUFFER_BINDING, &mut fbo);
        fbo
    }
}

/// Looked up by name, since GTK may be built without one of the backends.
fn native_display(display: &gtk4::gdk::Display) -> Option<NativeDisplay> {
    type Get = unsafe extern "C" fn(*mut c_void) -> *mut c_void;
    let (symbol, wrap): (&[u8], fn(*mut c_void) -> NativeDisplay) = match display.type_().name() {
        "GdkWaylandDisplay" => (
            c"gdk_wayland_display_get_wl_display".to_bytes_with_nul(),
            NativeDisplay::Wayland,
        ),
        "GdkX11Display" => (
            c"gdk_x11_display_get_xdisplay".to_bytes_with_nul(),
            NativeDisplay::X11,
        ),
        _ => return None,
    };
    let this = libloading::os::unix::Library::this();
    // SAFETY: GDK's getter for this display type, called with that display.
    unsafe {
        let get: Get = *this.get::<Get>(symbol).ok()?;
        let raw = get(glib::object::ObjectType::as_ptr(display).cast());
        (!raw.is_null()).then(|| wrap(raw))
    }
}

type Render = Rc<RefCell<Option<RenderContext>>>;

thread_local! {
    static AREA: RefCell<Option<gtk4::GLArea>> = const { RefCell::new(None) };
    static RENDER: RefCell<Option<Render>> = const { RefCell::new(None) };
}

/// Draws the next frame when it is due, not in mpv's own wait, which would hold up the UI thread.
fn update_video() {
    let Some(area) = AREA.with(|a| a.borrow().clone()) else {
        return;
    };
    let Some(render) = RENDER.with(|r| r.borrow().clone()) else {
        return;
    };
    let render = render.borrow();
    let Some(r) = render.as_ref() else {
        return;
    };
    // mpv's render calls need its OpenGL context current, and GTK may have left another.
    area.make_current();
    if !r.update() {
        return;
    }
    // A frame drawn in one refresh shows at the next; the timer can fire late.
    let refresh = area
        .frame_clock()
        .map(|c| c.refresh_info(0).0)
        .filter(|&us| us > 0)
        .unwrap_or(16_667);
    let lead = Duration::from_micros(refresh as u64) + Duration::from_millis(2);
    match r.next_frame_in().and_then(|wait| wait.checked_sub(lead)) {
        Some(wait) if !wait.is_zero() => {
            glib::timeout_add_local_once(wait, move || area.queue_render());
        }
        _ => area.queue_render(),
    }
}

/// The GLArea mpv's render API draws into, beneath the web view.
pub struct VideoSurface {
    overlay: gtk4::Overlay,
    area: gtk4::GLArea,
    render: Render,
}

impl VideoSurface {
    pub fn new() -> Result<Self, String> {
        let overlay = gtk4::Overlay::new();
        let area = gtk4::GLArea::new();
        area.set_auto_render(false);
        area.set_hexpand(true);
        area.set_vexpand(true);
        overlay.set_child(Some(&area));
        AREA.with(|a| *a.borrow_mut() = Some(area.clone()));

        let render: Render = Rc::default();
        RENDER.with(|r| *r.borrow_mut() = Some(render.clone()));
        area.connect_render({
            let render = render.clone();
            move |area, _| {
                if let Some(r) = render.borrow().as_ref() {
                    let scale = area.scale_factor();
                    r.draw(
                        current_fbo(),
                        area.width() * scale,
                        area.height() * scale,
                        true,
                    );
                }
                glib::Propagation::Stop
            }
        });
        Ok(Self {
            overlay,
            area,
            render,
        })
    }

    pub fn widget(&self) -> &gtk4::Overlay {
        &self.overlay
    }

    pub fn attach(&self, mpv: Arc<Mpv>) {
        let start = {
            let render = self.render.clone();
            move |area: &gtk4::GLArea| {
                area.make_current();
                if let Some(e) = area.error() {
                    return log::error!("OpenGL context: {e}");
                }
                let display = native_display(&area.display());
                let gl = area.context().map(|c| {
                    let (major, minor) = c.version();
                    format!("{:?} {major}.{minor}", c.api())
                });
                log::info!("mpv render context display={display:?} gl={gl:?}");
                match RenderContext::new(
                    mpv.clone(),
                    get_proc_address,
                    std::ptr::null_mut(),
                    display,
                    true, // advanced control
                    8,    // a GtkGLArea's default framebuffer is 8 bits a channel
                ) {
                    Ok(mut ctx) => {
                        ctx.on_update(|| {
                            glib::idle_add_once(update_video);
                        });
                        *render.borrow_mut() = Some(ctx);
                        area.queue_render();
                    }
                    Err(e) => log::error!("{e}"),
                }
            }
        };
        if self.area.is_realized() {
            start(&self.area);
        } else {
            self.area.connect_realize(start);
        }
        self.area.connect_unrealize({
            let render = self.render.clone();
            move |area| {
                area.make_current();
                render.borrow_mut().take();
            }
        });
    }

    /// The render context goes before mpv, with its OpenGL context current.
    pub fn shutdown(&self) {
        self.area.make_current();
        self.render.borrow_mut().take();
    }

    pub fn resize(&self, _width: u32, _height: u32) {}
}
pub fn mpv_options(_video: &VideoSurface) -> Vec<(&'static str, String)> {
    vec![("vo", "libmpv".into()), ("hwdec", "auto-safe".into())]
}
