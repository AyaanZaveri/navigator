#![cfg_attr(all(windows, not(debug_assertions)), windows_subsystem = "windows")]
#[cfg(target_os = "linux")]
mod gtk_shell;
#[cfg(any(target_os = "macos", test))]
mod hdr;
mod mpv;
mod platform;
mod player;
mod protocol;
mod render;
mod server;
#[cfg(not(target_os = "linux"))]
mod tao_shell;

use mpv::Mpv;
use serde_json::{Value, json};
use std::path::PathBuf;
use std::sync::Arc;

struct App {
    url: String,
    origin: String,
    bridge: String,
    data: PathBuf,
    library: PathBuf,
    devtools: bool,
    _server: Option<server::Server>,
    _instance: std::fs::File,
    smoke: bool,
}

impl App {
    fn load() -> Result<Self, String> {
        let mut args = std::env::args().skip(1);
        let mut url = None;
        let mut resources = None;
        let mut library = std::env::var_os("NAVIGATOR_LIBMPV").map(PathBuf::from);
        let mut port: u16 = 37371;
        let mut devtools = cfg!(debug_assertions);
        let mut smoke = false;
        while let Some(arg) = args.next() {
            match arg.as_str() {
                "--url" => url = Some(args.next().ok_or("--url needs a value")?),
                "--resources" => {
                    resources = Some(PathBuf::from(
                        args.next().ok_or("--resources needs a path")?,
                    ))
                }
                "--libmpv" => {
                    library = Some(PathBuf::from(args.next().ok_or("--libmpv needs a path")?))
                }
                "--port" => {
                    port = args
                        .next()
                        .ok_or("--port needs a value")?
                        .parse()
                        .map_err(|_| "Invalid port")?
                }
                "--devtools" => devtools = true,
                "--smoke-test" => smoke = true,
                "--help" | "-h" => {
                    println!(
                        "Navigator Desktop\n  --url http://localhost:3000  Use an existing Next server\n  --resources PATH           Packaged server/runtime/lib folder\n  --libmpv PATH              Override the native library\n  --port PORT                Packaged server port (default 37371)\n  --devtools                 Enable web inspector\n  --smoke-test               Check compositing with generated color bars"
                    );
                    std::process::exit(0);
                }
                _ => return Err(format!("Unknown argument: {arg}")),
            }
        }
        if port == 0 {
            return Err("Use a stable nonzero port so sign-ins keep their origin".into());
        }
        let data = dirs::data_local_dir()
            .ok_or("No local data directory")?
            .join("Navigator Desktop");
        std::fs::create_dir_all(&data).map_err(|e| e.to_string())?;
        let instance =
            std::fs::File::create(data.join("instance.lock")).map_err(|e| e.to_string())?;
        instance
            .try_lock()
            .map_err(|_| "Navigator Desktop is already running")?;
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let resources = resources.unwrap_or_else(|| {
            if cfg!(target_os = "macos") && exe.parent().is_some_and(|p| p.ends_with("MacOS")) {
                exe.parent().unwrap().parent().unwrap().join("Resources")
            } else {
                exe.parent().unwrap().join("resources")
            }
        });
        let (url, server) = if smoke {
            ("about:blank".into(), None)
        } else {
            match url {
                Some(url) => (url, None),
                None if cfg!(debug_assertions) => ("http://localhost:3000".into(), None),
                None => {
                    let server = server::Server::start(&resources, port)?;
                    (format!("http://127.0.0.1:{port}"), Some(server))
                }
            }
        };
        if !smoke {
            let parsed = protocol::media_url(&url)?;
            if parsed.username() != "" || parsed.password().is_some() {
                return Err("App URLs cannot contain credentials".into());
            }
        }
        let origin = if smoke {
            "null".into()
        } else {
            protocol::origin(&url).ok_or("Invalid app origin")?
        };
        let platform = std::env::consts::OS;
        let bridge = include_str!("bridge.js")
            .replace("__PROTOCOL__", &protocol::PROTOCOL.to_string())
            .replace("__ORIGIN__", &json!(origin).to_string())
            .replace("__PLATFORM__", &json!(platform).to_string());
        let bundled = if cfg!(target_os = "macos") {
            "libmpv.2.dylib"
        } else if cfg!(windows) {
            "libmpv-2.dll"
        } else {
            "libmpv.so.2"
        };
        let library = library.unwrap_or_else(|| {
            let vendor = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("vendor")
                .join(format!(
                    "{}-{}",
                    std::env::consts::OS,
                    std::env::consts::ARCH
                ))
                .join(bundled);
            let mut candidates = vec![resources.join("lib").join(bundled), vendor];
            if cfg!(target_os = "macos") {
                candidates.extend([
                    "/opt/homebrew/lib/libmpv.2.dylib".into(),
                    "/usr/local/lib/libmpv.2.dylib".into(),
                    "/opt/local/lib/libmpv.2.dylib".into(),
                ]);
            }
            candidates
                .into_iter()
                .find(|p| p.is_file())
                .unwrap_or_else(|| bundled.into())
        });
        Ok(Self {
            url,
            origin,
            bridge,
            data,
            library,
            devtools,
            _server: server,
            _instance: instance,
            smoke,
        })
    }

    fn start_player(
        &self,
        surface: &platform::VideoSurface,
        emit: impl Fn(Value) + Send + 'static,
    ) -> Result<player::Player, String> {
        let mut options = platform::mpv_options(surface);
        if self.smoke {
            options.push(("loop-file", "inf".into()));
        }
        options.extend(
            [
                ("config", "no"),
                ("load-scripts", "no"),
                ("idle", "yes"),
                ("keep-open", "no"),
                ("osc", "no"),
                ("osd-bar", "no"),
                ("ytdl", "no"),
                ("input-default-bindings", "no"),
                ("input-vo-keyboard", "no"),
                ("input-cursor", "no"),
                ("terminal", "no"),
                ("access-references", "no"),
                ("load-unsafe-playlists", "no"),
                ("demuxer", "lavf"),
                (
                    "demuxer-lavf-o",
                    "protocol_whitelist=%40%http,https,tcp,tls,crypto,data,httpproxy",
                ),
                ("force-window", if cfg!(windows) { "yes" } else { "no" }),
            ]
            .into_iter()
            .map(|(k, v)| (k, v.to_string())),
        );
        let borrowed: Vec<_> = options.iter().map(|(k, v)| (*k, v.as_str())).collect();
        #[cfg(windows)]
        platform::prepare_library(&self.library);
        let mpv = Arc::new(Mpv::new(&self.library, &borrowed)?);
        // Any missing required playback boundary is fatal, rather than a logged option warning.
        for (name, value) in [("access-references", "no"), ("load-unsafe-playlists", "no")] {
            mpv.set_property(name, value)?;
        }
        player::Player::start(mpv, emit, |gamma, primaries| {
            #[cfg(target_os = "macos")]
            platform::update_hdr(gamma, primaries);
            #[cfg(not(target_os = "macos"))]
            let _ = (gamma, primaries);
        })
    }
}

/// Native compositor check with a generated Y4M file; no server or external media.
fn smoke_file() -> Result<PathBuf, String> {
    let path = std::env::temp_dir().join(format!("navigator-smoke-{}.y4m", std::process::id()));
    let mut bytes = b"YUV4MPEG2 W320 H180 F30:1 Ip A1:1 C420jpeg\n".to_vec();
    for frame in 0..60 {
        bytes.extend(b"FRAME\n");
        for _ in 0..180 {
            for x in 0..320 {
                bytes.push(32 + (((x / 40 + frame / 10) % 7) * 30) as u8);
            }
        }
        bytes.extend(vec![90; 320 * 180 / 4]);
        bytes.extend(vec![180; 320 * 180 / 4]);
    }
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(path)
}

fn receive(message: &Value) -> String {
    format!("window.__navigatorDesktopReceive?.({message});")
}

fn main() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("warn")).init();
    let result = App::load().and_then(|app| {
        #[cfg(not(target_os = "linux"))]
        {
            tao_shell::run(app)
        }
        #[cfg(target_os = "linux")]
        {
            gtk_shell::run(app)
        }
    });
    if let Err(message) = result {
        eprintln!("Navigator Desktop: {message}");
        std::process::exit(1);
    }
}
