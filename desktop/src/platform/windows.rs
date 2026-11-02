// SPDX-License-Identifier: AGPL-3.0-only
// Adapted from Viren070/AIOStreams, commit c358754b0ae4758d034badf8618de6fdb7fa9333.
// See desktop/THIRD-PARTY.md for provenance and modifications.
use crate::mpv::Mpv;
use std::sync::Arc;
use tao::{platform::windows::WindowExtWindows, window::Window};
use windows_sys::Win32::{
    Foundation::*, Graphics::Gdi::*, System::LibraryLoader::GetModuleHandleW,
    UI::WindowsAndMessaging::*,
};

pub fn prepare_library(library: &std::path::Path) {
    use windows_sys::Win32::System::LibraryLoader::LoadLibraryW;
    // Prefer the driver's system loader. Retain the handle for libmpv's lifetime.
    if !unsafe { LoadLibraryW(wide("vulkan-1.dll").as_ptr()) }.is_null() {
        return;
    }
    let fallback = library.with_file_name("vulkan").join("vulkan-1.dll");
    if unsafe { LoadLibraryW(wide(&fallback.to_string_lossy()).as_ptr()) }.is_null() {
        log::warn!(
            "Could not load the Vulkan fallback: {}",
            std::io::Error::last_os_error()
        );
    }
}
fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(Some(0)).collect()
}

pub const WINDOW_CLASS: &str = "NavigatorDesktop";
pub fn window_class(smoke: bool) -> &'static str {
    if smoke {
        "NavigatorDesktopSmoke"
    } else {
        WINDOW_CLASS
    }
}
pub const APP_ID: &str = "app.navigator.desktop";

pub fn claim_app_id() {
    unsafe {
        windows_sys::Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID(
            wide(APP_ID).as_ptr(),
        );
    }
}

pub fn activate_existing(smoke: bool) -> bool {
    // Another launch may arrive between profile locking and window creation.
    for _ in 0..40 {
        unsafe {
            let hwnd = FindWindowW(wide(window_class(smoke)).as_ptr(), std::ptr::null());
            if !hwnd.is_null() {
                if IsIconic(hwnd) != 0 {
                    ShowWindow(hwnd, SW_RESTORE);
                }
                SetForegroundWindow(hwnd);
                return true;
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(25));
    }
    false
}

pub fn show_error(message: &str) {
    let text = format!(
        "Navigator could not start.\n\n{message}\n\nClose any other Navigator window and try again. If files are missing, reinstall the private build. For a WebView2 error, repair Microsoft Edge WebView2 Runtime."
    );
    unsafe {
        MessageBoxW(
            std::ptr::null_mut(),
            wide(&text).as_ptr(),
            wide("Navigator").as_ptr(),
            MB_OK | MB_ICONERROR,
        );
    }
}

unsafe extern "system" fn loading_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    if msg == WM_PAINT {
        unsafe {
            let mut paint = std::mem::zeroed();
            let dc = BeginPaint(hwnd, &mut paint);
            let mut rect = std::mem::zeroed();
            GetClientRect(hwnd, &mut rect);
            FillRect(dc, &rect, GetStockObject(BLACK_BRUSH));
            SetBkMode(dc, TRANSPARENT as i32);
            SetTextColor(dc, 0x00e2e2e2);
            let text = wide("Starting Navigator…");
            DrawTextW(
                dc,
                text.as_ptr(),
                (text.len() - 1) as i32,
                &mut rect,
                DT_CENTER | DT_VCENTER | DT_SINGLELINE,
            );
            EndPaint(hwnd, &paint);
        }
        return 0;
    }
    unsafe { DefWindowProcW(hwnd, msg, wparam, lparam) }
}

/// A lightweight native first frame; no browser startup is required to paint it.
pub struct LoadingView(HWND);
impl LoadingView {
    pub fn new(window: &Window) -> Result<Self, String> {
        unsafe {
            let class = wide("NavigatorLoading");
            let instance = GetModuleHandleW(std::ptr::null());
            let wc = WNDCLASSW {
                lpfnWndProc: Some(loading_proc),
                hInstance: instance,
                lpszClassName: class.as_ptr(),
                hbrBackground: GetStockObject(BLACK_BRUSH),
                ..std::mem::zeroed()
            };
            RegisterClassW(&wc);
            let size = window.inner_size();
            let hwnd = CreateWindowExW(
                0,
                class.as_ptr(),
                std::ptr::null(),
                WS_CHILD | WS_VISIBLE,
                0,
                0,
                size.width as i32,
                size.height as i32,
                window.hwnd() as HWND,
                std::ptr::null_mut(),
                instance,
                std::ptr::null(),
            );
            if hwnd.is_null() {
                return Err("Could not create startup view".into());
            }
            UpdateWindow(hwnd);
            Ok(Self(hwnd))
        }
    }
    pub fn resize(&self, width: u32, height: u32) {
        unsafe {
            SetWindowPos(
                self.0,
                HWND_TOP,
                0,
                0,
                width as i32,
                height as i32,
                SWP_NOACTIVATE,
            );
        }
    }
}
impl Drop for LoadingView {
    fn drop(&mut self) {
        unsafe {
            DestroyWindow(self.0);
        }
    }
}
unsafe extern "system" fn video_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    unsafe { DefWindowProcW(hwnd, msg, wparam, lparam) }
}
/// The child window mpv draws into, kept beneath the web view.
pub struct VideoSurface {
    hwnd: HWND,
}

impl VideoSurface {
    pub fn new(window: &Window) -> Result<Self, String> {
        let (parent, size) = (window.hwnd(), window.inner_size());
        let (width, height) = (size.width, size.height);
        let class = wide("NavigatorVideo");
        unsafe {
            let instance = GetModuleHandleW(std::ptr::null());
            let wc = WNDCLASSW {
                lpfnWndProc: Some(video_proc),
                hInstance: instance,
                lpszClassName: class.as_ptr(),
                hbrBackground: GetStockObject(BLACK_BRUSH),
                ..std::mem::zeroed()
            };
            RegisterClassW(&wc);
            let hwnd = CreateWindowExW(
                0,
                class.as_ptr(),
                std::ptr::null(),
                WS_CHILD | WS_VISIBLE,
                0,
                0,
                width as i32,
                height as i32,
                parent as HWND,
                std::ptr::null_mut(),
                instance,
                std::ptr::null(),
            );
            if hwnd.is_null() {
                return Err("could not create the video window".into());
            }
            Ok(Self { hwnd })
        }
    }

    /// mpv draws into the window itself, so it needs no render context.
    pub fn attach(&self, _mpv: Arc<Mpv>) {}

    pub fn shutdown(&self) {}

    pub fn resize(&self, width: u32, height: u32) {
        unsafe {
            SetWindowPos(
                self.hwnd,
                HWND_BOTTOM,
                0,
                0,
                width as i32,
                height as i32,
                SWP_NOACTIVATE,
            );
        }
    }
}
pub fn mpv_options(video: &VideoSurface) -> Vec<(&'static str, String)> {
    vec![
        ("wid", (video.hwnd as i64).to_string()),
        ("vo", "gpu-next,gpu,".into()),
        ("gpu-context", "d3d11".into()),
        ("hwdec", "auto-safe".into()),
        ("tone-mapping", "bt.2390".into()),
    ]
}
