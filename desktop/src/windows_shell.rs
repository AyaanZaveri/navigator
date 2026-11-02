//! Windows has a native first frame and cancellable backend initialization.
//! The macOS renderer and its render-thread lifecycle remain in tao_shell.
use crate::{
    App, platform,
    player::Player,
    protocol, receive,
    window_state::{Display, Placement},
};
use serde_json::{Value, json};
use std::{
    io::Write,
    path::{Path, PathBuf},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::{Duration, Instant},
};
use tao::{
    dpi::{LogicalSize, PhysicalPosition, PhysicalSize},
    event::{Event, WindowEvent},
    event_loop::{ControlFlow, EventLoopBuilder},
    platform::windows::{IconExtWindows, WindowBuilderExtWindows},
    window::{Fullscreen, Icon, Theme, Window, WindowBuilder},
};
use wry::{NewWindowResponse, Rect, WebContext, WebView, WebViewBuilder};

type Boot = Result<(App, Player, Option<PathBuf>), String>;
enum UserEvent {
    Boot(Box<Boot>),
    Emit(Value),
    Fullscreen(bool),
    Drag,
    WindowControl(protocol::WindowAction),
    Ready(bool),
    PageLoaded,
}

fn bounds(size: PhysicalSize<u32>) -> Rect {
    Rect {
        position: PhysicalPosition::new(0, 0).into(),
        size: size.into(),
    }
}

fn record(path: &Path, started: Instant, stage: &str) {
    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
    {
        let _ = writeln!(
            file,
            "{}",
            json!({"pid":std::process::id(), "stage":stage, "elapsed_ms":started.elapsed().as_millis(),
                "unix_ms":std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis()})
        );
    }
}

fn placement(window: &Window) -> Option<Placement> {
    let position = window.outer_position().ok()?;
    let size = window.inner_size().to_logical::<f64>(window.scale_factor());
    Some(Placement {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
        maximized: false,
    })
}

fn remember_placement(window: &Window, normal: &mut Option<Placement>) {
    if window.fullscreen().is_none() && !window.is_minimized() {
        if window.is_maximized() {
            if let Some(normal) = normal {
                normal.maximized = true;
            }
        } else {
            *normal = placement(window);
        }
    }
}

fn resize_views(
    surface: &platform::VideoSurface,
    view: Option<&WebView>,
    loading: Option<&platform::LoadingView>,
    size: PhysicalSize<u32>,
) {
    if size.width == 0 || size.height == 0 {
        return;
    }
    surface.resize(size.width, size.height);
    if let Some(view) = view {
        let _ = view.set_bounds(bounds(size));
    }
    if let Some(loading) = loading {
        loading.resize(size.width, size.height);
    }
}

fn make_view(
    context: &mut WebContext,
    app: &App,
    player: &Player,
    window: &Window,
    proxy: &tao::event_loop::EventLoopProxy<UserEvent>,
) -> Result<WebView, String> {
    let origin = app.origin.clone();
    let smoke = app.smoke;
    let requests = player.sender();
    let ipc = proxy.clone();
    let nav_origin = origin.clone();
    let nav_log = app.data.join("startup.jsonl");
    let nav_started = app.started;
    let page = proxy.clone();
    let builder = WebViewBuilder::new_with_web_context(context)
        .with_bounds(bounds(window.inner_size()))
        .with_transparent(true)
        .with_devtools(app.devtools)
        .with_initialization_script(&app.bridge)
        .with_ipc_handler(move |request| {
            if !(smoke && request.uri().to_string() == "about:blank")
                && protocol::origin(&request.uri().to_string()).as_deref() != Some(&origin)
            {
                return;
            }
            match protocol::parse(request.body()) {
                Ok(protocol::Command::AppReady { dark }) => {
                    let _ = ipc.send_event(UserEvent::Ready(dark));
                }
                Ok(protocol::Command::Fullscreen { value }) => {
                    let _ = ipc.send_event(UserEvent::Fullscreen(value));
                }
                Ok(protocol::Command::WindowControl { action }) => {
                    let _ = ipc.send_event(UserEvent::WindowControl(action));
                }
                Ok(protocol::Command::WindowDrag {}) => {
                    let _ = ipc.send_event(UserEvent::Drag);
                }
                Ok(command) => {
                    let _ = requests.send(command);
                }
                Err(message) => {
                    let session = serde_json::from_str::<Value>(request.body())
                        .ok()
                        .and_then(|v| v.get("session").cloned());
                    let _ = ipc.send_event(UserEvent::Emit(
                        json!({"type":"error","session":session,"message":message}),
                    ));
                }
            }
        })
        .with_navigation_handler(move |url| {
            if smoke {
                record(&nav_log, nav_started, &format!("smoke-navigation:{url}"));
            }
            let allowed = (smoke && url == "about:blank")
                || protocol::origin(&url).as_deref() == Some(&nav_origin);
            if !allowed && protocol::media_url(&url).is_ok() {
                let _ = open::that_detached(url);
            }
            allowed
        })
        .with_new_window_req_handler(|url, _| {
            if protocol::media_url(&url).is_ok() {
                let _ = open::that_detached(url);
            }
            NewWindowResponse::Deny
        })
        .with_on_page_load_handler(move |event, _| {
            if matches!(event, wry::PageLoadEvent::Finished) {
                let _ = page.send_event(UserEvent::PageLoaded);
            }
        });
    let builder = if smoke {
        builder.with_html(include_str!("smoke.html"))
    } else {
        builder.with_url(&app.url)
    };
    builder
        .build_as_child(window)
        .map_err(|error| error.to_string())
}

pub fn run(app: App) -> Result<(), String> {
    platform::claim_app_id();
    let started = app.started;
    let log = app.data.join("startup.jsonl");
    if std::fs::metadata(&log).is_ok_and(|m| m.len() > 1024 * 1024) {
        let previous = app.data.join("startup.previous.jsonl");
        let _ = std::fs::remove_file(&previous);
        let _ = std::fs::rename(&log, previous);
    }
    let state_path = app.data.join("window.json");
    let event_loop = EventLoopBuilder::<UserEvent>::with_user_event().build();
    let proxy = event_loop.create_proxy();
    let saved = std::fs::read(&state_path)
        .ok()
        .and_then(|b| serde_json::from_slice::<Placement>(&b).ok());
    let displays: Vec<_> = event_loop
        .available_monitors()
        .map(|m| Display {
            x: m.position().x,
            y: m.position().y,
            width: m.size().width,
            height: m.size().height,
            scale: m.scale_factor(),
        })
        .collect();
    let restored = saved.and_then(|s| s.restore(&displays));
    let icon = Icon::from_resource(1, None).ok();
    let mut builder = WindowBuilder::new()
        .with_title("Navigator")
        .with_decorations(false)
        .with_undecorated_shadow(true)
        .with_window_classname(platform::window_class(app.smoke))
        .with_window_icon(icon.clone())
        .with_taskbar_icon(icon)
        .with_background_color((0, 0, 0, 255))
        .with_visible(false)
        .with_inner_size(if app.smoke {
            LogicalSize::new(960.0, 640.0)
        } else {
            LogicalSize::new(1280.0, 800.0)
        })
        .with_min_inner_size(LogicalSize::new(480.0, 360.0));
    if let Some(saved) = &restored {
        builder = builder
            .with_position(PhysicalPosition::new(saved.x, saved.y))
            .with_inner_size(LogicalSize::new(saved.width, saved.height));
    }
    let window = builder.build(&event_loop).map_err(|e| e.to_string())?;
    let mut normal = restored.or_else(|| placement(&window));
    platform::install_chrome(&window);
    let surface = platform::VideoSurface::new(&window)?;
    let mut loading = Some(platform::LoadingView::new(&window)?);
    window.set_visible(true);
    if normal.as_ref().is_some_and(|p| p.maximized) {
        window.set_maximized(true);
    }
    record(&log, started, "window-visible");

    let cancelled = Arc::new(AtomicBool::new(false));
    let cancel = cancelled.clone();
    let boot_proxy = proxy.clone();
    let emit_proxy = proxy.clone();
    let options = platform::mpv_options(&surface);
    let boot_log = log.clone();
    let worker = std::thread::Builder::new()
        .name("navigator-startup".into())
        .spawn(move || {
            let result = (|| {
                let mut app = app;
                if let Some((resources, port)) = app.backend.take() {
                    app._server = Some(crate::server::Server::start_cancellable(
                        &resources, port, &cancel,
                    )?);
                }
                record(&boot_log, started, "backend-ready");
                if cancel.load(Ordering::Relaxed) {
                    return Err("Startup cancelled".into());
                }
                let smoke = if app.smoke {
                    Some(crate::smoke_file()?)
                } else {
                    None
                };
                let player = match app.start_player_options(options, move |value| {
                    let _ = emit_proxy.send_event(UserEvent::Emit(value));
                }) {
                    Ok(player) => player,
                    Err(error) => {
                        if let Some(path) = &smoke {
                            let _ = std::fs::remove_file(path);
                        }
                        return Err(error);
                    }
                };
                record(&boot_log, started, "player-ready");
                Ok((app, player, smoke))
            })();
            let _ = boot_proxy.send_event(UserEvent::Boot(Box::new(result)));
        })
        .map_err(|e| e.to_string())?;

    let mut context = None;
    let mut view: Option<WebView> = None;
    let mut running: Option<(App, Player, Option<PathBuf>)> = None;
    let mut closing = false;
    let mut fullscreen = false;
    let mut ready = false;
    let mut loaded = false;
    let mut ready_deadline = None;
    let mut exit_code = 0;
    let mut smoke_playing = false;
    event_loop.run(move |event, _, flow| {
        *flow = if closing || ready_deadline.is_some() { ControlFlow::WaitUntil(Instant::now() + Duration::from_millis(16)) } else { ControlFlow::Wait };
        match event {
            Event::UserEvent(UserEvent::Boot(result)) => match *result {
                Ok((app, player, smoke_path)) => {
                    if closing { player.begin_shutdown(); }
                    running = Some((app, player, smoke_path));
                    if !closing {
                        let (app, player, _) = running.as_ref().unwrap();
                        surface.attach(player.mpv.clone());
                        context = Some(WebContext::new(Some(app.data.join("webview"))));
                        match make_view(context.as_mut().unwrap(), app, player, &window, &proxy) {
                            Ok(webview) => {
                                view = Some(webview);
                                if let Some(loading) = &loading { let size = window.inner_size(); loading.resize(size.width, size.height); }
                                record(&log, started, "webview-created");
                                ready_deadline = Some(Instant::now() + Duration::from_secs(30));
                            }
                            Err(error) => {
                                exit_code = 1;
                                platform::show_error(&format!("WebView2 could not initialize: {error}"));
                                closing = true; player.begin_shutdown();
                            }
                        }
                    }
                }
                Err(message) => {
                    exit_code = 1;
                    if !closing { record(&log, started, "startup-error"); platform::show_error(&message); }
                    closing = true;
                }
            },
            Event::UserEvent(UserEvent::Ready(dark)) => {
                window.set_theme(Some(if dark { Theme::Dark } else { Theme::Light }));
                if !ready { ready = true; ready_deadline = None; loading.take(); record(&log, started, "app-ready"); }
            }
            Event::UserEvent(UserEvent::PageLoaded) => {
                loaded = true;
                platform::install_chrome(&window);
                record(&log, started, "page-loaded");
                if let Some((app, player, smoke)) = &running {
                    if app.smoke {
                        if let Some(view) = &view {
                            let probe_log = log.clone();
                            let _ = view.evaluate_script_with_callback("JSON.stringify({url:location.href,origin:location.origin,html:document.documentElement.outerHTML,bridge:typeof window.navigatorDesktop,visibility:document.visibilityState})", move |result| record(&probe_log, started, &format!("smoke-document:{result}")));
                        }
                        loading.take(); ready_deadline = None;
                        if let Some(path) = smoke { player.send(protocol::Command::Load { session:"native-smoke".into(), url:path.to_string_lossy().into_owned(), headers:Default::default() }); }
                    }
                }
                if let Some(view) = &view { let _ = view.evaluate_script(&receive(&json!({"type":"fullscreen","value":fullscreen}))); }
            }
            Event::UserEvent(UserEvent::Emit(value)) => {
                if !smoke_playing && running.as_ref().is_some_and(|(app, _, _)| app.smoke)
                    && value["type"] == "state" && value["state"]["width"].as_f64().unwrap_or(0.0) > 0.0
                    && value["state"]["position"].as_f64().unwrap_or(0.0) > 0.2 {
                    smoke_playing = true; record(&log, started, "smoke-playing");
                }
                if let Some(view) = &view { let _ = view.evaluate_script(&receive(&value)); }
            }
            Event::UserEvent(UserEvent::Fullscreen(value)) => { window.set_fullscreen(value.then_some(Fullscreen::Borderless(None))); }
            Event::UserEvent(UserEvent::WindowControl(action)) => match action {
                protocol::WindowAction::Minimize => window.set_minimized(true),
                protocol::WindowAction::ToggleMaximize => window.set_maximized(!window.is_maximized()),
                protocol::WindowAction::Close => platform::request_close(&window),
            },
            Event::UserEvent(UserEvent::Drag) => { if !fullscreen { let _ = window.drag_window(); } }
            Event::WindowEvent { event: WindowEvent::CloseRequested, .. } => {
                if let Some(normal) = &mut normal {
                    if window.fullscreen().is_none() { normal.maximized = window.is_maximized(); }
                    if let Ok(bytes) = serde_json::to_vec(normal) {
                        let temp = state_path.with_extension("tmp");
                        if std::fs::write(&temp, bytes).is_ok() { let _ = std::fs::rename(temp, &state_path); }
                    }
                }
                closing = true; cancelled.store(true, Ordering::Relaxed); window.set_visible(false);
                if let Some((_, player, _)) = &running { player.begin_shutdown(); }
            }
            Event::WindowEvent { event: WindowEvent::Resized(size), .. } => {
                resize_views(&surface, view.as_ref(), loading.as_ref(), size);
                if let Some(view) = &view { let _ = view.evaluate_script(&receive(&json!({"type":"window-state","maximized":window.is_maximized()}))); }
                remember_placement(&window, &mut normal);
            }
            Event::WindowEvent { event: WindowEvent::ScaleFactorChanged { new_inner_size, .. }, .. } => {
                resize_views(&surface, view.as_ref(), loading.as_ref(), *new_inner_size);
            }
            Event::WindowEvent { event: WindowEvent::Moved(_), .. } => {
                // Moving a window doesn't resize either GPU surface.
                remember_placement(&window, &mut normal);
            }
            _ => {}
        }
        let actual = window.fullscreen().is_some();
        platform::set_chrome_fullscreen(actual);
        if actual != fullscreen {
            fullscreen = actual;
            if let Some(view) = &view { let _ = view.evaluate_script(&receive(&json!({"type":"fullscreen","value":actual}))); }
        }
        // Chromium can pause requestAnimationFrame while minimized. Give a
        // restored window a fresh paint deadline instead of reporting a false
        // startup failure, and leave the event loop asleep while minimized.
        if !ready && !closing && view.is_some() && running.as_ref().is_some_and(|(app, _, _)| !app.smoke) {
            if window.is_minimized() { ready_deadline = None; }
            else if ready_deadline.is_none() { ready_deadline = Some(Instant::now() + Duration::from_secs(30)); }
        }
        if ready_deadline.is_some_and(|deadline| Instant::now() >= deadline) {
            exit_code = 1;
            ready_deadline = None; loading.take(); record(&log, started, "app-ready-timeout");
            platform::show_error(if loaded { "The interface loaded but did not become interactive. Restart Navigator." } else { "The local interface did not finish loading. Restart Navigator and check startup.jsonl in your local Navigator Desktop data folder." });
            closing = true;
            if let Some((_, player, _)) = &running { player.begin_shutdown(); }
        }
        if closing && worker.is_finished() && running.as_ref().is_none_or(|(_, p, _)| p.finished()) {
            // Dispose the WebView before its context/profile and backend.
            view.take(); context.take();
            if let Some((mut app, mut player, smoke)) = running.take() {
                surface.shutdown(); player.join(); drop(app._server.take());
                if let Some(path) = smoke { let _ = std::fs::remove_file(path); }
            }
            record(&log, started, "closed");
            *flow = ControlFlow::ExitWithCode(exit_code);
        } else if closing || ready_deadline.is_some() {
            // A transition above may have started shutdown or a deadline while
            // this iteration began in Wait. Keep pumping without another input.
            *flow = ControlFlow::WaitUntil(Instant::now() + Duration::from_millis(16));
        }
    });
}
