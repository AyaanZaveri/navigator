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
