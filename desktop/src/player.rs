use crate::mpv::{Event, Kind, Mpv};
use crate::protocol::{Command, TrackKind};
use serde_json::{Value, json};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, mpsc};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

const PROPERTIES: &[(&str, Kind)] = &[
    ("time-pos", Kind::Double),
    ("duration", Kind::Double),
    ("pause", Kind::Flag),
    ("volume", Kind::Double),
    ("mute", Kind::Flag),
    ("speed", Kind::Double),
    ("paused-for-cache", Kind::Flag),
    ("seeking", Kind::Flag),
    ("demuxer-cache-time", Kind::Double),
    ("track-list", Kind::Json),
    ("sub-text", Kind::String),
    ("video-params/w", Kind::Double),
    ("video-params/h", Kind::Double),
    ("video-params/gamma", Kind::String),
    ("video-params/primaries", Kind::String),
];

fn video_colour(mpv: &Mpv) -> (Option<String>, Option<String>) {
    let text = |name| {
        mpv.get_property(name, Kind::String)
            .and_then(|value| value.as_str().map(str::to_owned))
    };
    (text("video-params/gamma"), text("video-params/primaries"))
}

/// All blocking client calls run here, away from the render API's UI thread.
pub struct Player {
    pub mpv: Arc<Mpv>,
    requests: mpsc::Sender<Command>,
    quit: Arc<AtomicBool>,
    worker: Option<JoinHandle<()>>,
}

impl Player {
    pub fn start(
        mpv: Arc<Mpv>,
        emit: impl Fn(Value) + Send + Sync + 'static,
        colour: impl Fn(Option<String>, Option<String>) + Send + 'static,
    ) -> Result<Self, String> {
        // Keep subtitle decoding active; React draws the cues above the video.
        mpv.set_property("sub-visibility", "no")?;
        let emit = Arc::new(emit);
        for (id, (name, kind)) in PROPERTIES.iter().enumerate() {
            mpv.observe(name, *kind, id as u64)?;
        }
        mpv.request_log_messages("warn")?;
        let (requests, inbox) = mpsc::channel();
        let quit = Arc::new(AtomicBool::new(false));
        let (client, stopped) = (mpv.clone(), quit.clone());
        let worker = std::thread::Builder::new().name("navigator-mpv".into()).spawn(move || {
            let mut session = String::new();
            let mut desired = String::new();
            let mut entries = HashMap::<i64, String>::new();
            let mut playing_id = -1;
            let mut last_colour = (None, None);
            let mut previews: Option<crate::thumbnails::Previews> = None;
            let mut preview_source = None;
            let mut state = json!({"position":0.0,"duration":0.0,"paused":true,"volume":1.0,"muted":false,"rate":1.0,"buffering":false,"seeking":false,"buffered":0.0,"width":0,"height":0});
            let mut dirty = false;
            let mut last = Instant::now();
            while !stopped.load(Ordering::Relaxed) {
                for command in inbox.try_iter().take(32) {
                    let target = match &command {
                        Command::Load { session, .. } | Command::Play { session } | Command::Pause { session }
                        | Command::Seek { session, .. } | Command::Volume { session, .. } | Command::Muted { session, .. }
                        | Command::Rate { session, .. } | Command::Track { session, .. } | Command::Stop { session } | Command::Thumbnail { session, .. } | Command::VideoFit { session, .. } => session,
                        Command::Fullscreen { .. } | Command::WindowDrag {} | Command::WindowControl { .. } | Command::AppReady { .. } => continue,
                    };
                    if !matches!(command, Command::Load { .. }) && target != &desired { continue; }
                    let target = target.clone();
                    let result = match command {
                        Command::Load { session: next, url, headers } => {
                            desired = next.clone();
                            previews = None;
                            preview_source = Some((next.clone(), url.clone(), headers.clone()));
                            // mpv's %length% syntax quotes commas and arbitrary header values.
                            let fields = headers.iter().map(|(name, value)| {
                                let field = format!("{name}: {value}");
                                format!("%{}%{field}", field.len())
                            }).collect::<Vec<_>>().join(",");
                            let result = client.set_property("http-header-fields", &fields)
                                .and_then(|_| client.set_property("pause", "no"))
                                .and_then(|_| client.command(&["loadfile", &url, "replace"]));
                            if result.is_ok() {
                                if let Some(id) = client.get_property("playlist/0/id", Kind::Double).and_then(|v| v.as_f64()) {
                                    entries.insert(id as i64, next);
                                }
                            }
                            result
                        }
                        Command::Play { .. } => client.set_property("pause", "no"),
                        Command::Pause { .. } => client.set_property("pause", "yes"),
                        Command::Seek { position, .. } => client.command(&["seek", &position.to_string(), "absolute+exact"]),
                        Command::Volume { volume, .. } => client.set_property("volume", &(volume * 100.0).to_string()),
                        Command::Muted { muted, .. } => client.set_property("mute", if muted { "yes" } else { "no" }),
                        Command::Rate { rate, .. } => client.set_property("speed", &rate.to_string()),
                        Command::VideoFit { mode, .. } => {
                            use crate::protocol::VideoFitMode;
                            client.set_property("keepaspect", if matches!(mode, VideoFitMode::Stretch) { "no" } else { "yes" })
                                .and_then(|_| client.set_property("panscan", if matches!(mode, VideoFitMode::Crop) { "1" } else { "0" }))
                        }
                        Command::Track { kind, id, .. } => client.set_property(match kind { TrackKind::Audio => "aid", TrackKind::Subtitle => "sid" }, &id),
                        Command::Stop { .. } => { desired.clear(); previews = None; preview_source = None; client.command(&["stop"]) },
                        Command::Thumbnail { request, position, .. } => { if let Some(previews) = &previews { previews.want(request, position); } Ok(()) },
                        Command::Fullscreen { .. } | Command::WindowDrag {} | Command::WindowControl { .. } | Command::AppReady { .. } => unreachable!(),
                    };
                    if let Err(message) = result { emit(json!({"type":"error","session":target,"message":message})); }
                }
                let event = client.wait_event(0.02, |id| PROPERTIES.get(id as usize).is_some_and(|(_, k)| *k == Kind::Json));
                if matches!(&event, Some(Event::FileLoaded)) || matches!(&event, Some(Event::Property { name, .. }) if matches!(name.as_str(), "video-params/gamma" | "video-params/primaries")) {
                    // Read both together, including when a property becomes unavailable.
                    // Never synchronously query mpv from the main/render thread.
                    let now = video_colour(&client);
                    if now != last_colour {
                        last_colour = now.clone();
                        colour(now.0, now.1);
                    }
                }
                match event {
                    Some(Event::StartFile { playlist_id }) => {
                        playing_id = playlist_id;
                        session = entries.remove(&playlist_id).unwrap_or_default();
                        state["position"] = json!(0.0); state["duration"] = json!(0.0); state["buffered"] = json!(0.0);
                        emit(json!({"type":"subtitle","session":session,"text":""}));
                        emit(json!({"type":"loading","session":session}));
                    }
                    Some(Event::FileLoaded) => {
                        if let Some((named, url, headers)) = preview_source.take() {
                            if named == desired { previews = Some(crate::thumbnails::Previews::new(named, url, headers, emit.clone())); }
                        }
                        // Metadata must precede loadedmetadata: the React handler resumes here.
                        for (name, key, kind) in [("duration", "duration", Kind::Double), ("time-pos", "position", Kind::Double), ("video-params/w", "width", Kind::Double), ("video-params/h", "height", Kind::Double)] {
                            if let Some(value) = client.get_property(name, kind) { state[key] = value; }
                        }
                        emit(json!({"type":"state","session":session,"state":state}));
                        emit(json!({"type":"loaded","session":session}));
                    }
                    Some(Event::PlaybackRestart) => {
                        state["seeking"] = json!(false);
                        emit(json!({"type":"state","session":session,"state":state}));
                        emit(json!({"type":"ready","session":session}));
                    }
                    Some(Event::Seek) => { state["seeking"] = json!(true); dirty = true; }
                    Some(Event::EndFile { playlist_id, reason, error }) => {
                        if playlist_id != playing_id { entries.remove(&playlist_id); continue; }
                        if previews.as_ref().is_some_and(|p| p.session() == session) { previews = None; }
                        last_colour = (None, None);
                        colour(None, None);
                        emit(json!({"type":"subtitle","session":session,"text":""}));
                        if let Some(message) = error { emit(json!({"type":"error","session":session,"message":message})); }
                        else if reason == "eof" { emit(json!({"type":"ended","session":session})); }
                    }
                    Some(Event::Property { name, value, .. }) if name == "sub-text" => {
                        // An unavailable property also clears the previous cue.
                        emit(json!({"type":"subtitle","session":session,"text":value.as_str().unwrap_or("")}));
                    }
                    Some(Event::Property { name, value, .. }) if !value.is_null() => {
                        if name == "track-list" { emit(json!({"type":"tracks","session":session,"tracks":value})); continue; }
                        let key = match name.as_str() {
                            "time-pos" => "position", "duration" => "duration", "pause" => "paused", "volume" => "volume",
                            "mute" => "muted", "speed" => "rate", "paused-for-cache" => "buffering", "seeking" => "seeking",
                            "demuxer-cache-time" => "buffered", "video-params/w" => "width", "video-params/h" => "height", _ => continue,
                        };
                        state[key] = if key == "volume" { json!(value.as_f64().unwrap_or(100.0) / 100.0) } else { value };
                        dirty = true;
                        if matches!(key, "paused" | "volume" | "muted" | "rate" | "buffering" | "seeking") && !session.is_empty() {
                            emit(json!({"type":"state","session":session,"state":state}));
                            last = Instant::now(); dirty = false;
                        }
                        if !matches!(key, "position" | "buffered") { last = Instant::now() - Duration::from_secs(1); }
                    }
                    Some(Event::Log { prefix, text, .. }) => log::warn!("mpv {prefix}: {}", text.trim()),
                    Some(Event::Shutdown) => break,
                    _ => {}
                }
                if dirty && last.elapsed() >= Duration::from_millis(250) && !session.is_empty() {
                    emit(json!({"type":"state","session":session,"state":state}));
                    last = Instant::now(); dirty = false;
                }
            }
            // The UI must keep pumping while mpv finishes a render-dependent stop.
            let _ = client.command(&["stop"]);
            colour(None, None);
        }).map_err(|e| e.to_string())?;
        Ok(Self {
            mpv,
            requests,
            quit,
            worker: Some(worker),
        })
    }

    pub fn send(&self, command: Command) {
        let _ = self.requests.send(command);
        self.mpv.wakeup();
    }
    pub fn sender(&self) -> mpsc::Sender<Command> {
        self.requests.clone()
    }
    pub fn begin_shutdown(&self) {
        self.quit.store(true, Ordering::Relaxed);
        self.mpv.wakeup();
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
    use std::collections::BTreeMap;

    fn wait_for(inbox: &mpsc::Receiver<Value>, predicate: impl Fn(&Value) -> bool) -> Value {
        let until = Instant::now() + Duration::from_secs(8);
        while Instant::now() < until {
            if let Ok(value) = inbox.recv_timeout(Duration::from_millis(100)) {
                if predicate(&value) {
                    return value;
                }
            }
        }
        panic!("Timed out waiting for an actual libmpv playback event");
    }

    #[test]
    #[ignore = "set NAVIGATOR_TEST_LIBMPV and run with --include-ignored"]
    fn headless_library_playback_and_session_replacement() {
        let library =
            std::env::var("NAVIGATOR_TEST_LIBMPV").expect("Provide an actual libmpv path");
        let file = std::env::temp_dir().join(format!("navigator-mpv-{}.wav", std::process::id()));
        // Four seconds of 8 kHz mono PCM: no network, browser, or additional server.
        let length: u32 = 4 * 8000 * 2;
        let mut wave = Vec::new();
        wave.extend(b"RIFF");
        wave.extend((36 + length).to_le_bytes());
        wave.extend(b"WAVEfmt ");
        wave.extend(16u32.to_le_bytes());
        wave.extend(1u16.to_le_bytes());
        wave.extend(1u16.to_le_bytes());
        wave.extend(8000u32.to_le_bytes());
        wave.extend(16000u32.to_le_bytes());
        wave.extend(2u16.to_le_bytes());
        wave.extend(16u16.to_le_bytes());
        wave.extend(b"data");
        wave.extend(length.to_le_bytes());
        wave.resize(44 + length as usize, 0);
        std::fs::write(&file, wave).unwrap();
        let mpv = Arc::new(
            Mpv::new(
                std::path::Path::new(&library),
                &[
                    ("config", "no"),
                    ("vo", "null"),
                    ("ao", "null"),
                    ("idle", "yes"),
                    ("terminal", "no"),
                ],
            )
            .unwrap(),
        );
        let (send, inbox) = mpsc::channel();
        let mut player = Player::start(
            mpv,
            move |value| {
                let _ = send.send(value);
            },
            |_, _| {},
        )
        .unwrap();
        let load = |session: &str| Command::Load {
            session: session.into(),
            url: file.to_string_lossy().into_owned(),
            headers: BTreeMap::new(),
        };
        player.send(load("first"));
        wait_for(&inbox, |v| v["type"] == "loaded" && v["session"] == "first");
        player.send(Command::Pause {
            session: "first".into(),
        });
        let paused = wait_for(&inbox, |v| {
            v["type"] == "state" && v["session"] == "first" && v["state"]["paused"] == true
        });
        assert!(paused["state"]["duration"].as_f64().unwrap() > 3.9);
        player.send(Command::Seek {
            session: "first".into(),
            position: 1.0,
        });
        wait_for(&inbox, |v| {
            v["type"] == "state" && v["state"]["position"].as_f64().unwrap_or(0.0) >= 0.9
        });
        // Both loads can reach mpv before either START_FILE is drained.
        player.send(load("second"));
        player.send(load("third"));
        wait_for(&inbox, |v| v["type"] == "loaded" && v["session"] == "third");
        player.send(Command::Volume {
            session: "third".into(),
            volume: 0.42,
        });
        wait_for(&inbox, |v| {
            v["type"] == "state"
                && v["session"] == "third"
                && (v["state"]["volume"].as_f64().unwrap_or(0.0) - 0.42).abs() < 0.001
        });
        player.send(Command::Stop {
            session: "third".into(),
        });
        player.begin_shutdown();
        player.join();
        std::fs::remove_file(file).unwrap();
    }

    #[test]
    #[ignore = "set NAVIGATOR_TEST_LIBMPV and NAVIGATOR_TEST_HDR_DIR (pq.mkv, hlg.mkv, sdr.mkv)"]
    fn headless_hdr_metadata_and_sdr_transition() {
        let library = std::env::var("NAVIGATOR_TEST_LIBMPV").unwrap();
        let directory = std::path::PathBuf::from(std::env::var("NAVIGATOR_TEST_HDR_DIR").unwrap());
        let mpv = Arc::new(
            Mpv::new(
                std::path::Path::new(&library),
                &[
                    ("config", "no"),
                    ("vo", "null"),
                    ("ao", "null"),
                    ("idle", "yes"),
                    ("terminal", "no"),
                ],
            )
            .unwrap(),
        );
        let (send, inbox) = mpsc::channel();
        let events = send.clone();
        let mut player = Player::start(
            mpv.clone(),
            move |value| {
                let _ = events.send(value);
            },
            move |gamma, primaries| {
                let _ = send.send(json!({"type":"colour", "gamma":gamma, "primaries":primaries}));
            },
        )
        .unwrap();
        for (file, gamma, primaries) in [
            ("pq", "pq", "bt.2020"),
            ("hlg", "hlg", "bt.2020"),
            ("sdr", "bt.1886", "bt.709"),
        ] {
            player.send(Command::Load {
                session: file.into(),
                url: directory
                    .join(format!("{file}.mkv"))
                    .to_string_lossy()
                    .into_owned(),
                headers: BTreeMap::new(),
            });
            wait_for(&inbox, |v| {
                v["type"] == "colour" && v["gamma"] == gamma && v["primaries"] == primaries
            });
        }
        // Exercise the same nonblocking writes used by the main/render thread.
        for (name, value) in [
            ("target-prim", "bt.2020"),
            ("target-trc", "pq"),
            ("target-peak", "812"),
            ("icc-profile", ""),
        ] {
            mpv.set_property_async(name, value).unwrap();
        }
        let until = Instant::now() + Duration::from_secs(3);
        while mpv
            .get_property("target-trc", Kind::String)
            .and_then(|v| v.as_str().map(str::to_owned))
            .as_deref()
            != Some("pq")
        {
            assert!(
                Instant::now() < until,
                "Asynchronous HDR output properties were not applied"
            );
            std::thread::sleep(Duration::from_millis(10));
        }
        for &(name, value) in crate::hdr::SDR_OUTPUT_OPTIONS {
            mpv.set_property_async(name, value).unwrap();
        }
        let until = Instant::now() + Duration::from_secs(3);
        while mpv
            .get_property("target-trc", Kind::String)
            .as_ref()
            .and_then(Value::as_str)
            != Some("srgb")
        {
            assert!(
                Instant::now() < until,
                "SDR transfer was not restored after HDR"
            );
            std::thread::sleep(Duration::from_millis(10));
        }
        assert_eq!(
            mpv.get_property("target-prim", Kind::String)
                .as_ref()
                .and_then(Value::as_str),
            Some("bt.709")
        );
        player.send(Command::Stop {
            session: "sdr".into(),
        });
        wait_for(&inbox, |v| v["type"] == "colour" && v["gamma"].is_null());
        player.begin_shutdown();
        player.join();
    }

    #[test]
    #[ignore = "set NAVIGATOR_TEST_LIBMPV and NAVIGATOR_TEST_HDR_DIR"]
    fn headless_text_subtitles_with_native_drawing_hidden() {
        let library = std::env::var("NAVIGATOR_TEST_LIBMPV").unwrap();
        let directory = std::path::PathBuf::from(std::env::var("NAVIGATOR_TEST_HDR_DIR").unwrap());
        let subtitle =
            std::env::temp_dir().join(format!("navigator-subtitles-{}.srt", std::process::id()));
        std::fs::write(
            &subtitle,
            "1\n00:00:00,000 --> 00:00:03,900\nOverlay first line\nOverlay second line\n",
        )
        .unwrap();
        let mpv = Arc::new(
            Mpv::new(
                std::path::Path::new(&library),
                &[
                    ("config", "no"),
                    ("vo", "null"),
                    ("ao", "null"),
                    ("idle", "yes"),
                    ("terminal", "no"),
                ],
            )
            .unwrap(),
        );
        let (send, inbox) = mpsc::channel();
        let mut player = Player::start(
            mpv.clone(),
            move |value| {
                let _ = send.send(value);
            },
            |_, _| {},
        )
        .unwrap();
        assert_eq!(
            mpv.get_property("sub-visibility", Kind::Flag),
            Some(json!(false))
        );
        player.send(Command::Load {
            session: "captions".into(),
            url: directory.join("sdr.mkv").to_string_lossy().into_owned(),
            headers: BTreeMap::new(),
        });
        wait_for(&inbox, |v| {
            v["type"] == "loaded" && v["session"] == "captions"
        });
        mpv.command(&["sub-add", &subtitle.to_string_lossy(), "select"])
            .unwrap();
        wait_for(&inbox, |v| {
            v["type"] == "subtitle"
                && v["text"].as_str().is_some_and(|text| {
                    text.contains("Overlay first line") && text.contains("Overlay second line")
                })
        });
        mpv.set_property("sid", "no").unwrap();
        wait_for(&inbox, |v| v["type"] == "subtitle" && v["text"] == "");
        player.begin_shutdown();
        player.join();
        std::fs::remove_file(subtitle).unwrap();
    }
}
