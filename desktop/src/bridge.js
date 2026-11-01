(() => {
  if (window.top !== window || location.origin !== __ORIGIN__) return;
  const listeners = new Set();
  const platform = __PLATFORM__;
  let session;
  let fullscreen = false;
  Object.defineProperty(window, "__navigatorDesktopReceive", {
    value(message) {
      if (message.type === "fullscreen") {
        fullscreen = message.value;
        mark();
      }
      for (const listener of [...listeners]) {
        try { listener(message); } catch (error) { console.error(error); }
      }
    },
  });
  Object.defineProperty(window, "navigatorDesktop", {
    value: Object.freeze({
      protocol: __PROTOCOL__,
      platform,
      get fullscreen() { return fullscreen; },
      send(message) {
        if (message.type === "load") session = message.session;
        window.ipc.postMessage(JSON.stringify(message));
      },
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    }),
  });
  // WKWebView must have an alpha background before its first paint.
  function mark() {
    if (!document.documentElement) return;
    document.documentElement.dataset.desktop = "mpv";
    document.documentElement.dataset.nativePlatform = platform;
    document.documentElement.dataset.desktopFullscreen = String(fullscreen);
    document.documentElement.style.setProperty("background", "transparent", "important");
    document.documentElement.style.colorScheme = "normal";
  }
  mark();
  if (!document.documentElement) {
    const observer = new MutationObserver(() => {
      if (document.documentElement) { mark(); observer.disconnect(); }
    });
    observer.observe(document, { childList: true, subtree: true });
  }
  document.addEventListener("DOMContentLoaded", mark, { once: true });
  if (platform === "macos") {
    // Only blank header space drags. Inputs, links, menus and player gestures
    // retain their normal mouse behavior; synthetic events cannot move windows.
    document.addEventListener("mousedown", (event) => {
      if (!event.isTrusted || event.button !== 0 || fullscreen) return;
      const target = event.target;
      if (!target?.closest || target.closest('a, button, input, textarea, select, [role="button"], [role="menu"], [contenteditable], [data-no-window-drag]')) return;
      if (!target.closest("[data-window-drag-region]") && event.clientY >= 20) return;
      event.preventDefault();
      window.navigatorDesktop.send({ type: "window-drag" });
    });
  }
  window.addEventListener("pagehide", () => {
    if (session) window.navigatorDesktop.send({ type: "stop", session });
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "F11" || (event.key === "Escape" && fullscreen)) {
      event.preventDefault();
      window.navigatorDesktop.send({ type: "fullscreen", value: !fullscreen });
    }
  });
})();
