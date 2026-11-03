//! Installation-only preparation. No window, profile lock, cookies or user data
//! is needed; ordinary launches never enter this path.
use crate::{mpv::Mpv, platform, startup_log, windows_process::Process};
use std::{io::Write, time::{Duration, Instant}};

pub fn prepare() -> Result<(), String> {
    let started = Instant::now();
    let data = dirs::data_local_dir().ok_or("No local application data directory")?.join("Navigator Desktop");
    std::fs::create_dir_all(&data).map_err(|e| e.to_string())?;
    let log = data.join("installation.jsonl");
    startup_log::record(&log, started, "preparation-started");
    let result = (|| {
        if std::env::args().count() != 2 { return Err("Unexpected installation preparation arguments".into()); }
        let executable = std::env::current_exe().map_err(|e| e.to_string())?;
        let resources = executable.parent().ok_or("No installation directory")?.join("resources");
        let mut child = Process::prepare_install(&resources.join("runtime").join("node.exe"), &resources)?;
        let deadline = Instant::now() + Duration::from_secs(180);
        loop {
            match child.try_exit_code()? {
                Some(0) => break,
                Some(code) => return Err(format!("Startup file or local service verification failed (exit {code})")),
                None if Instant::now() >= deadline => return Err("Installation preparation timed out".into()),
                None => std::thread::sleep(Duration::from_millis(50)),
            }
        }
        // Closing the job also cleans any descendant left by a failed service.
        drop(child);
        startup_log::record(&log, started, "startup-files-and-service-verified");
        let library = resources.join("lib").join("libmpv-2.dll");
        platform::prepare_library(&library);
        let player = Mpv::new(&library, &[
            ("config", "no"), ("load-scripts", "no"), ("terminal", "no"),
            ("vo", "null"), ("ao", "null"), ("idle", "yes"),
        ])?;
        drop(player);
        startup_log::record(&log, started, "video-engine-verified");
        Ok(())
    })();
    startup_log::record(&log, started, if result.is_ok() { "preparation-complete" } else { "preparation-failed" });
    if let Err(message) = &result {
        if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(data.join("installation.log")) {
            let _ = writeln!(file, "{message}");
        }
    }
    result
}
