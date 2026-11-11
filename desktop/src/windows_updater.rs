//! WinSparkle owns networking, signature verification and its native update UI.
//! Only fixed commands cross the web bridge; no URL, path or key comes from JS.
use libloading::Library;
use std::{ffi::CString, path::Path, sync::OnceLock};

pub const FEED: &str =
    "https://raw.githubusercontent.com/AyaanZaveri/navigator/main/updates/windows.xml";
pub const PUBLIC_KEY: &str = include_str!("../windows/update-public-key.txt");
#[derive(Clone, Copy, Debug)]
pub enum Event {
    Available,
    Current,
    Error,
    Dismissed,
    Shutdown,
}
static NOTIFY: OnceLock<Box<dyn Fn(Event) + Send + Sync>> = OnceLock::new();
fn notify(event: Event) {
    if let Some(send) = NOTIFY.get() {
        send(event);
    }
}
extern "C" fn available() {
    notify(Event::Available);
}
extern "C" fn current() {
    notify(Event::Current);
}
extern "C" fn error() {
    notify(Event::Error);
}
extern "C" fn dismissed() {
    notify(Event::Dismissed);
}
extern "C" fn shutdown() {
    notify(Event::Shutdown);
}
extern "C" fn can_shutdown() -> i32 {
    1
} // Install requires explicit acceptance in WinSparkle's dialog.
type Void = unsafe extern "C" fn();
type SetInt = unsafe extern "C" fn(i32);
pub struct Updater {
    library: Library,
    check: Void,
    automatic: SetInt,
    cleanup: Void,
}
impl Updater {
    pub fn start(
        directory: &Path,
        automatic: bool,
        send: impl Fn(Event) + Send + Sync + 'static,
    ) -> Result<Self, String> {
        Self::configured(directory, automatic, send, FEED, PUBLIC_KEY)
    }
    fn configured(
        directory: &Path,
        automatic: bool,
        send: impl Fn(Event) + Send + Sync + 'static,
        feed_url: &str,
        public_key: &str,
    ) -> Result<Self, String> {
        // Never load through PATH/the working directory. Installed files only.
        let library = unsafe { Library::new(directory.join("resources/lib/WinSparkle.dll")) }
            .map_err(|e| e.to_string())?;
        unsafe {
            macro_rules! get {
                ($name:literal, $ty:ty) => {
                    *library
                        .get::<$ty>(concat!($name, "\0").as_bytes())
                        .map_err(|e| e.to_string())?
                };
            }
            let init = get!("win_sparkle_init", Void);
            #[cfg(test)]
            {
                let registry = get!(
                    "win_sparkle_set_registry_path",
                    unsafe extern "C" fn(*const i8)
                );
                registry(
                    CString::new("Software\\NavigatorUpdaterDownloadFixture")
                        .unwrap()
                        .as_ptr(),
                );
            }

            let cleanup = get!("win_sparkle_cleanup", Void);
            let check = get!("win_sparkle_check_update_with_ui", Void);
            let automatic_fn = get!("win_sparkle_set_automatic_check_for_updates", SetInt);
            let feed = get!(
                "win_sparkle_set_appcast_url",
                unsafe extern "C" fn(*const i8)
            );
            let key = get!(
                "win_sparkle_set_eddsa_public_key",
                unsafe extern "C" fn(*const i8) -> i32
            );
            let details = get!(
                "win_sparkle_set_app_details",
                unsafe extern "C" fn(*const u16, *const u16, *const u16)
            );
            let wide = |s: &str| s.encode_utf16().chain(Some(0)).collect::<Vec<_>>();
            details(
                wide("Navigator").as_ptr(),
                wide("Navigator").as_ptr(),
                wide(env!("CARGO_PKG_VERSION")).as_ptr(),
            );
            feed(CString::new(feed_url).unwrap().as_ptr());
            if key(CString::new(public_key.trim()).unwrap().as_ptr()) != 1 {
                return Err("Invalid update signing key".into());
            }
            // Resolve all required APIs before initializing any helper threads.
            let callbacks = [
                (
                    get!(
                        "win_sparkle_set_did_find_update_callback",
                        unsafe extern "C" fn(extern "C" fn())
                    ),
                    available as extern "C" fn(),
                ),
                (
                    get!(
                        "win_sparkle_set_did_not_find_update_callback",
                        unsafe extern "C" fn(extern "C" fn())
                    ),
                    current as extern "C" fn(),
                ),
                (
                    get!(
                        "win_sparkle_set_error_callback",
                        unsafe extern "C" fn(extern "C" fn())
                    ),
                    error as extern "C" fn(),
                ),
                (
                    get!(
                        "win_sparkle_set_update_dismissed_callback",
                        unsafe extern "C" fn(extern "C" fn())
                    ),
                    dismissed as extern "C" fn(),
                ),
                (
                    get!(
                        "win_sparkle_set_shutdown_request_callback",
                        unsafe extern "C" fn(extern "C" fn())
                    ),
                    shutdown as extern "C" fn(),
                ),
            ];
            let can = get!(
                "win_sparkle_set_can_shutdown_callback",
                unsafe extern "C" fn(extern "C" fn() -> i32)
            );
            NOTIFY
                .set(Box::new(send))
                .map_err(|_| "Updater already initialized")?;
            for (set, callback) in callbacks {
                set(callback);
            }
            can(can_shutdown);
            automatic_fn(i32::from(automatic));
            init();
            Ok(Self {
                library,
                check,
                automatic: automatic_fn,
                cleanup,
            })
        }
    }
    pub fn check(&self) {
        unsafe {
            (self.check)();
        }
    }
    pub fn automatic(&self, enabled: bool) {
        unsafe {
            (self.automatic)(i32::from(enabled));
        }
    }
}
impl Drop for Updater {
    fn drop(&mut self) {
        // Stops and joins helper threads before unloading the DLL/callback code.
        unsafe {
            (self.cleanup)();
        }
        let _ = &self.library;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};
    static HANDLED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
    // WinSparkle only invokes this AFTER verifying the downloaded archive.
    extern "C" fn handle_verified_installer(_: *const u16) -> i32 {
        HANDLED.store(true, std::sync::atomic::Ordering::SeqCst);
        1
    }
    #[test]
    #[ignore = "requires Windows fixture server and real WinSparkle DLL; run with scripts/windows-updater-smoke.mjs"]
    fn native_fixture() {
        let config: serde_json::Value = serde_json::from_slice(
            &std::fs::read(std::env::var("NAVIGATOR_UPDATER_FIXTURE").unwrap()).unwrap(),
        )
        .unwrap();
        let events = Arc::new(Mutex::new(Vec::new()));
        let output = events.clone();
        let updater = Updater::configured(
            Path::new(config["directory"].as_str().unwrap()),
            false,
            move |event| {
                output.lock().unwrap().push(event);
            },
            config["feed"].as_str().unwrap(),
            config["key"].as_str().unwrap(),
        )
        .unwrap();
        unsafe {
            let handler = *updater
                .library
                .get::<unsafe extern "C" fn(extern "C" fn(*const u16) -> i32)>(
                    b"win_sparkle_set_user_run_installer_callback\0",
                )
                .unwrap();
            handler(handle_verified_installer);
            if config["install"] == true {
                let check = *updater
                    .library
                    .get::<Void>(b"win_sparkle_check_update_with_ui_and_install\0")
                    .unwrap();
                check();
            } else {
                updater.check();
            }
        }
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(30);
        let expected = config["expected"].as_str().unwrap();
        loop {
            let events = events.lock().unwrap();
            let done = events.iter().any(|event| {
                matches!(
                    (expected, event),
                    ("current", Event::Current)
                        | ("error", Event::Error)
                        | ("installed", Event::Shutdown)
                )
            });
            if done {
                break;
            }
            assert!(
                std::time::Instant::now() < deadline,
                "Timed out waiting for {expected}: {events:?}"
            );
            drop(events);
            std::thread::sleep(std::time::Duration::from_millis(25));
        }
        assert_eq!(
            HANDLED.load(std::sync::atomic::Ordering::SeqCst),
            expected == "installed",
            "Unverified payload must never reach installer callback"
        );
        drop(updater);
    }
}
