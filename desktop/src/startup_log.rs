use std::{
    io::Write,
    path::Path,
    sync::Mutex,
    time::{Instant, SystemTime, UNIX_EPOCH},
};

// Startup now runs on the UI and backend threads concurrently. Formatting a
// JSON value with writeln! can issue several writes, interleaving two entries.
static WRITER: Mutex<()> = Mutex::new(());

pub fn record(path: &Path, started: Instant, stage: &str) {
    let _guard = WRITER.lock().unwrap_or_else(|error| error.into_inner());
    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
    {
        let entry = serde_json::json!({
            "pid": std::process::id(), "stage": stage,
            "elapsed_ms": started.elapsed().as_millis(),
            "unix_ms": SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis(),
        });
        if let Ok(mut bytes) = serde_json::to_vec(&entry) {
            bytes.push(b'\n');
            let _ = file.write_all(&bytes);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn concurrent_entries_remain_complete_json_lines() {
        let path = std::env::temp_dir().join(format!(
            "navigator-startup-{}-{}.jsonl",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let started = Instant::now();
        std::thread::scope(|scope| {
            for _ in 0..8 {
                let path = &path;
                scope.spawn(move || {
                    for _ in 0..100 {
                        record(path, started, "concurrent-test");
                    }
                });
            }
        });
        let contents = std::fs::read_to_string(&path).unwrap();
        std::fs::remove_file(path).unwrap();
        assert_eq!(contents.lines().count(), 800);
        for line in contents.lines() {
            let entry: serde_json::Value = serde_json::from_str(line).unwrap();
            assert_eq!(entry["stage"], "concurrent-test");
            assert!(entry["pid"].as_u64().is_some());
        }
    }
}
