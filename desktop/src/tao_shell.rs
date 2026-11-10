use crate::{App, platform, protocol, receive};
use serde_json::{Value, json};
use std::time::{Duration, Instant};
use tao::dpi::{LogicalSize, PhysicalPosition, PhysicalSize};
use tao::event::{Event, WindowEvent};
use tao::event_loop::{ControlFlow, EventLoopBuilder};
use tao::window::{Fullscreen, WindowBuilder};
#[cfg(target_os = "macos")]
use tao::{dpi::LogicalPosition, platform::macos::WindowBuilderExtMacOS};
use wry::{NewWindowResponse, Rect, WebContext, WebViewBuilder};

enum UserEvent {
    Emit(Value),
    Fullscreen(bool),
    WindowControlsVisible(bool),
    DragWindow,
    Close,
    SyncFullscreen,
}

fn bounds(size: PhysicalSize<u32>) -> Rect {
    Rect {
        position: PhysicalPosition::new(0, 0).into(),
        size: size.into(),
    }
}

pub fn run(mut app: App) -> Result<(), String> {
    let event_loop = EventLoopBuilder::<UserEvent>::with_user_event().build();
    let proxy = event_loop.create_proxy();
    #[cfg(target_os = "macos")]
    let menu = platform::install_menu({
        let proxy = proxy.clone();
        move || {
            let _ = proxy.send_event(UserEvent::Close);
        }
    })?;
    let builder = WindowBuilder::new()
        .with_title("Navigator")
        .with_inner_size(LogicalSize::new(1280.0, 800.0))
        .with_min_inner_size(LogicalSize::new(720.0, 480.0));
    // Keep AppKit's real window buttons/fullscreen behavior, with the WebView
    // extending behind the transparent titlebar instead of a separate strip.
    #[cfg(target_os = "macos")]
    let builder = builder
        .with_titlebar_transparent(true)
        .with_title_hidden(true)
        .with_fullsize_content_view(true)
        // Eight points higher, matching the player Back button's center.
        .with_traffic_light_inset(LogicalPosition::new(16.0, 30.0));
    let window = builder.build(&event_loop).map_err(|e| e.to_string())?;
    let surface = platform::VideoSurface::new(&window)?;
    let mut player = app.start_player(&surface, {
        let proxy = proxy.clone();
        move |value| {
            let _ = proxy.send_event(UserEvent::Emit(value));
        }
    })?;
    surface.attach(player.mpv.clone());
    let mut context = WebContext::new(Some(app.data.join("webview")));
    let app_origin = app.origin.clone();
    let requests = player.sender();
    let ipc_proxy = proxy.clone();
    let smoke = app.smoke;
    let smoke_requests = player.sender();
    let smoke_path = if smoke {
        Some(crate::smoke_file()?)
    } else {
        None
    };
    let load_path = smoke_path.clone();
    let builder = WebViewBuilder::new_with_web_context(&mut context)
        .with_bounds(bounds(window.inner_size()))
        .with_transparent(true)
        .with_devtools(app.devtools)
        .with_initialization_script(&app.bridge)
        .with_ipc_handler(move |request| {
            if !(smoke && request.uri().to_string() == "about:blank")
                && protocol::origin(&request.uri().to_string()).as_deref() != Some(&app_origin)
            {
                return;
            }
            match protocol::parse(request.body()) {
                Ok(protocol::Command::ClientStage { stage }) => {
                    log::debug!("playback client stage {}", stage.label());
                }
                Ok(protocol::Command::Fullscreen { value }) => {
                    let _ = ipc_proxy.send_event(UserEvent::Fullscreen(value));
                }
                Ok(protocol::Command::WindowControlsVisible { visible }) => {
                    let _ = ipc_proxy.send_event(UserEvent::WindowControlsVisible(visible));
                }
                Ok(protocol::Command::WindowDrag {}) => {
                    let _ = ipc_proxy.send_event(UserEvent::DragWindow);
                }
                Ok(command) => {
                    let _ = requests.send(command);
                }
                Err(message) => {
                    let session = serde_json::from_str::<Value>(request.body())
                        .ok()
                        .and_then(|v| v.get("session").cloned());
                    let _ = ipc_proxy.send_event(UserEvent::Emit(
                        json!({"type":"error","session":session,"message":message}),
                    ));
                }
            }
        })
        .with_navigation_handler({
            let origin = app.origin.clone();
            move |url| {
                let allowed = (smoke && url == "about:blank")
                    || protocol::origin(&url).as_deref() == Some(&origin);
                if !allowed && protocol::media_url(&url).is_ok() {
                    let _ = open::that_detached(url);
                }
                allowed
            }
        })
        .with_new_window_req_handler(|url, _| {
            if protocol::media_url(&url).is_ok() {
                let _ = open::that_detached(url);
            }
            NewWindowResponse::Deny
        })
        .with_on_page_load_handler({
            let proxy = proxy.clone();
            move |event, _| {
                if let wry::PageLoadEvent::Finished = event {
                    let _ = proxy.send_event(UserEvent::SyncFullscreen);
                    if let Some(path) = &load_path {
                        let _ = smoke_requests.send(protocol::Command::Load {
                            session: "native-smoke".into(),
                            url: path.to_string_lossy().into_owned(),
                            headers: Default::default(),
                            start_position: 0.0,
                        });
                    }
                }
            }
        });
    let builder = if smoke {
        builder.with_html(include_str!("smoke.html"))
    } else {
        builder.with_url(&app.url)
    };
    let webview = builder.build_as_child(&window).map_err(|e| e.to_string())?;
    surface.resize(window.inner_size().width, window.inner_size().height);
    let mut closing = false;
    let mut fullscreen = false;
    let mut window_controls_visible = true;
    event_loop.run(move |event, _, flow| {
        // AppKit/Dock quit can destroy the loop without a CloseRequested event.
        // Stop the owned backend here rather than relying on process-exit drops.
        if matches!(&event, Event::LoopDestroyed) {
            drop(app._server.take());
            return;
        }
        // Own the backend for exactly as long as the native event loop.
        let _server = &app._server;
        let _instance = &app._instance;
        #[cfg(target_os = "macos")]
        let _menu = &menu;
        *flow = if closing {
            ControlFlow::WaitUntil(Instant::now() + Duration::from_millis(16))
        } else {
            ControlFlow::Wait
        };
        if closing && player.finished() {
            surface.shutdown();
            player.join();
            drop(app._server.take());
            if let Some(path) = &smoke_path {
                let _ = std::fs::remove_file(path);
            }
            *flow = ControlFlow::Exit;
            return;
        }
        match event {
            Event::UserEvent(UserEvent::Emit(value)) => {
                let _ = webview.evaluate_script(&receive(&value));
            }
            Event::UserEvent(UserEvent::Fullscreen(value)) => {
                #[cfg(target_os = "macos")]
                platform::set_window_controls_visible(&window, value || window_controls_visible);
                window.set_fullscreen(value.then_some(Fullscreen::Borderless(None)));
            }
            Event::UserEvent(UserEvent::WindowControlsVisible(visible)) => {
                window_controls_visible = visible;
                #[cfg(target_os = "macos")]
                platform::set_window_controls_visible(&window, visible || window.fullscreen().is_some());
            }
            Event::UserEvent(UserEvent::DragWindow) => {
                if window.fullscreen().is_none() {
                    let _ = window.drag_window();
                }
            }
            Event::UserEvent(UserEvent::SyncFullscreen) => {
                // A document reload must not leave playback-only chrome hidden.
                window_controls_visible = true;
                #[cfg(target_os = "macos")]
                platform::set_window_controls_visible(&window, true);
                let _ = webview.evaluate_script(&receive(
                    &json!({"type":"fullscreen","value":window.fullscreen().is_some()}),
                ));
            }
            Event::UserEvent(UserEvent::Close) => {
                closing = true;
                player.begin_shutdown();
            }
            Event::WindowEvent {
                event: WindowEvent::Resized(size),
                ..
            } => {
                surface.resize(size.width, size.height);
                #[cfg(target_os = "macos")]
                surface.refresh_hdr();
                let _ = webview.set_bounds(bounds(size));
            }
            Event::WindowEvent {
                event: WindowEvent::ScaleFactorChanged { new_inner_size, .. },
                ..
            } => {
                surface.resize(new_inner_size.width, new_inner_size.height);
                #[cfg(target_os = "macos")]
                surface.refresh_hdr();
                let _ = webview.set_bounds(bounds(*new_inner_size));
            }
            Event::WindowEvent {
                event: WindowEvent::Moved(_) | WindowEvent::Focused(true),
                ..
            } => {
                #[cfg(target_os = "macos")]
                surface.refresh_hdr();
            }
            Event::WindowEvent {
                event: WindowEvent::CloseRequested,
                ..
            } => {
                closing = true;
                player.begin_shutdown();
            }
            _ => {}
        }
        let actual = window.fullscreen().is_some();
        if fullscreen != actual {
            fullscreen = actual;
            #[cfg(target_os = "macos")]
            platform::set_window_controls_visible(&window, actual || window_controls_visible);
            #[cfg(target_os = "macos")]
            surface.refresh_hdr();
            let _ = webview.evaluate_script(&receive(&json!({"type":"fullscreen","value":actual})));
        }
    });
}
