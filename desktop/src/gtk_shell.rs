use crate::{App, platform, player::Player, protocol, receive};
use gtk4::{gdk, gio, glib, prelude::*};
use serde_json::{Value, json};
use std::cell::RefCell;
use std::rc::Rc;
use webkit6::{
    NavigationPolicyDecision, PolicyDecisionType, UserContentInjectedFrames,
    UserScriptInjectionTime, prelude::*,
};

pub fn run(app: App) -> Result<(), String> {
    gtk4::init().map_err(|e| e.to_string())?;
    let window = gtk4::Window::builder()
        .title("Navigator")
        .default_width(1280)
        .default_height(800)
        .build();
    window.set_size_request(720, 480);
    let surface = Rc::new(platform::VideoSurface::new()?);
    window.set_child(Some(surface.widget()));
    let (send, inbox) = std::sync::mpsc::channel::<Value>();
    let started = app.start_player(&surface, move |value| {
        let _ = send.send(value);
    })?;
    surface.attach(started.mpv.clone());
    let requests = started.sender();
    let player: Rc<RefCell<Option<Player>>> = Rc::new(RefCell::new(Some(started)));
    let manager = webkit6::UserContentManager::new();
    let shim = "window.ipc = { postMessage: message => window.webkit.messageHandlers.ipc.postMessage(message) };";
    manager.add_script(&webkit6::UserScript::new(
        &format!("{shim}\n{}", app.bridge),
        UserContentInjectedFrames::TopFrame,
        UserScriptInjectionTime::Start,
        &[],
        &[],
    ));
    manager.register_script_message_handler("ipc", None);
    let storage = app.data.join("webview");
    let session = webkit6::NetworkSession::new(
        Some(&storage.join("data").to_string_lossy()),
        Some(&storage.join("cache").to_string_lossy()),
    );
    let webview = webkit6::WebView::builder()
        .network_session(&session)
        .user_content_manager(&manager)
        .build();
    if let Some(settings) = webkit6::prelude::WebViewExt::settings(&webview) {
        settings.set_enable_developer_extras(app.devtools);
    }
    webview.set_background_color(&gdk::RGBA::new(0.0, 0.0, 0.0, 0.0));
    surface.widget().add_overlay(&webview);
    manager.connect_script_message_received(Some("ipc"), {
        let webview = webview.clone();
        let window = window.clone();
        let origin = app.origin.clone();
        let smoke = app.smoke;
        move |_, value| {
            if !(smoke && webview.uri().as_deref() == Some("about:blank"))
                && webview
                    .uri()
                    .as_deref()
                    .and_then(protocol::origin)
                    .as_deref()
                    != Some(&origin)
            {
                return;
            }
            let text = value.to_str();
            match protocol::parse(&text) {
                Ok(protocol::Command::Fullscreen { value }) => {
                    if value {
                        window.fullscreen();
                    } else {
                        window.unfullscreen();
                    }
                }
                Ok(command) => {
                    let _ = requests.send(command);
                }
                Err(message) => {
                    let session = serde_json::from_str::<Value>(&text)
                        .ok()
                        .and_then(|v| v.get("session").cloned());
                    webview.evaluate_javascript(
                        &receive(&json!({"type":"error","session":session,"message":message})),
                        None,
                        None,
                        None::<&gio::Cancellable>,
                        |_| {},
                    );
                }
            }
        }
    });
    webview.connect_decide_policy({
        let origin = app.origin.clone();
        let smoke = app.smoke;
        move |_, decision, kind| {
            if !matches!(
                kind,
                PolicyDecisionType::NavigationAction | PolicyDecisionType::NewWindowAction
            ) {
                return false;
            }
            let Some(nav) = decision.downcast_ref::<NavigationPolicyDecision>() else {
                return false;
            };
            let uri = nav
                .navigation_action()
                .and_then(|a| a.request())
                .and_then(|r| r.uri())
                .unwrap_or_default();
            if kind == PolicyDecisionType::NavigationAction
                && ((smoke && uri == "about:blank")
                    || protocol::origin(&uri).as_deref() == Some(&origin))
            {
                return false;
            }
            decision.ignore();
            if protocol::media_url(&uri).is_ok() {
                let _ = open::that_detached(uri.to_string());
            }
            true
        }
    });
    window.connect_fullscreened_notify({
        let webview = webview.clone();
        move |window| {
            webview.evaluate_javascript(
                &receive(&json!({"type":"fullscreen","value":window.is_fullscreen()})),
                None,
                None,
                None::<&gio::Cancellable>,
                |_| {},
            )
        }
    });
    let smoke_path = if app.smoke {
        Some(crate::smoke_file()?)
    } else {
        None
    };
    webview.connect_load_changed({
        let window = window.clone();
        let requests = player.borrow().as_ref().unwrap().sender();
        let smoke_path = smoke_path.clone();
        move |webview, event| {
            if event == webkit6::LoadEvent::Finished {
                if let Some(path) = &smoke_path {
                    let _ = requests.send(protocol::Command::Load {
                        session: "native-smoke".into(),
                        url: path.to_string_lossy().into_owned(),
                        headers: Default::default(),
                    });
                }
                webview.evaluate_javascript(
                    &receive(&json!({"type":"fullscreen","value":window.is_fullscreen()})),
                    None,
                    None,
                    None::<&gio::Cancellable>,
                    |_| {},
                );
            }
        }
    });
    let main_loop = glib::MainLoop::new(None, false);
    let closing = Rc::new(std::cell::Cell::new(false));
    window.connect_close_request({
        let player = player.clone();
        let closing = closing.clone();
        move |_| {
            closing.set(true);
            if let Some(p) = player.borrow().as_ref() {
                p.begin_shutdown();
            }
            glib::Propagation::Stop
        }
    });
    glib::timeout_add_local(std::time::Duration::from_millis(16), {
        let webview = webview.clone();
        let player = player.clone();
        let surface = surface.clone();
        let main_loop = main_loop.clone();
        move || {
            for value in inbox.try_iter().take(64) {
                webview.evaluate_javascript(
                    &receive(&value),
                    None,
                    None,
                    None::<&gio::Cancellable>,
                    |_| {},
                );
            }
            if closing.get() && player.borrow().as_ref().is_none_or(|p| p.finished()) {
                surface.shutdown();
                if let Some(mut p) = player.borrow_mut().take() {
                    p.join();
                }
                main_loop.quit();
                return glib::ControlFlow::Break;
            }
            glib::ControlFlow::Continue
        }
    });
    if app.smoke {
        webview.load_html(include_str!("smoke.html"), Some("about:blank"));
    } else {
        webview.load_uri(&app.url);
    }
    window.present();
    main_loop.run();
    if let Some(path) = &smoke_path {
        let _ = std::fs::remove_file(path);
    }
    drop(app);
    Ok(())
}
