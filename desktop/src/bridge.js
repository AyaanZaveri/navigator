(() => {
  if (window.top !== window || location.origin !== __ORIGIN__) return;
  const listeners = new Set();
  let session;
  let fullscreen = false;
  Object.defineProperty(window, "__navigatorDesktopReceive", {
    value(message) {
      if (message.type === "fullscreen") fullscreen = message.value;
      for (const listener of [...listeners]) {
        try { listener(message); } catch (error) { console.error(error); }
      }
    },
  });
  Object.defineProperty(window, "navigatorDesktop", {
    value: Object.freeze({
      protocol: __PROTOCOL__,
      platform: __PLATFORM__,
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
  const mark = () => {
    if (!document.documentElement) return;
    document.documentElement.dataset.desktop = "mpv";
    document.documentElement.style.setProperty("background", "transparent", "important");
    document.documentElement.style.colorScheme = "normal";
  };
  mark();
  if (!document.documentElement) {
    const observer = new MutationObserver(() => {
      if (document.documentElement) { mark(); observer.disconnect(); }
    });
    observer.observe(document, { childList: true, subtree: true });
  }
  document.addEventListener("DOMContentLoaded", mark, { once: true });
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
