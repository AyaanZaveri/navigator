(() => {
  const origin = __ORIGIN__;
  if (window.top !== window || location.origin !== origin || !window.NavigatorAndroid) return;
  const transport = window.NavigatorAndroid;
  const listeners = new Set();
  let fullscreen = false;
  let session = '';
  let visible;
  let insets;
  let dark;
  const send = message => transport.postMessage(JSON.stringify(message));
  const applyInsets = () => {
    if (!insets || !document.documentElement) return;
    for (const side of ['top', 'right', 'bottom', 'left']) {
      const value = insets[side];
      document.documentElement.style.setProperty(`--navigator-safe-${side}`, `${Number.isFinite(value) ? Math.max(0, value) : 0}px`);
    }
  };
  transport.onmessage = event => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (message.type === 'insets') { insets = message; applyInsets(); return; }
    if (message.type === 'fullscreen') fullscreen = !!message.value;
    if (message.type === 'close') {
      const handled = !document.dispatchEvent(new Event('navigatornativeclose', { cancelable: true }));
      // Compatibility with the deployed React player before the Android PR merges.
      if (!handled) {
        const shell = document.querySelector('[data-native-player-shell]');
        (shell?.querySelector('button[aria-label="Close player"]') || shell?.querySelector('button'))?.click();
      }
      return;
    }
    for (const listener of [...listeners]) {
      try { listener(message); } catch (error) { console.error(error); }
    }
  };
  Object.defineProperty(window, 'navigatorDesktop', {
    value: Object.freeze({
      protocol: 1,
      platform: 'android',
      engine: 'exoplayer',
      get fullscreen() { return fullscreen; },
      send(message) {
        if (message.type === 'load') session = message.session;
        if (message.type === 'stop' && message.session === session) session = '';
        send(message);
      },
      subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    }),
  });
  const mark = () => {
    const root = document.documentElement;
    if (!root) return false;
    // Keep the existing native-media CSS contract compatible with deployed clients.
    root.dataset.desktop = 'mpv';
    root.dataset.nativeEngine = 'exoplayer';
    root.style.setProperty('background', 'transparent', 'important');
    root.style.setProperty('color-scheme', 'normal', 'important');
    applyInsets();
    const appearance = () => {
      const next = root.dataset.theme ? root.dataset.theme === 'dark'
        : root.classList.contains('dark') || (window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ?? true);
      if (next !== dark) { dark = next; send({ type: 'appearance', dark }); }
    };
    new MutationObserver(appearance).observe(root, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    appearance();
    const update = () => {
      const next = root.hasAttribute('data-native-playing');
      if (next !== visible) { visible = next; send({ type: 'visible', value: next }); }
    };
    new MutationObserver(update).observe(root, { attributes: true, attributeFilter: ['data-native-playing'] });
    update();
    return true;
  };
  if (!mark()) {
    const observer = new MutationObserver(() => { if (mark()) observer.disconnect(); });
    observer.observe(document, { childList: true, subtree: true });
  }
  const installStyles = () => {
    if (!document.head) return false;
    const style = document.createElement('style');
    style.textContent = __EDGE_CSS__;
    document.head.appendChild(style);
    return true;
  };
  if (!installStyles()) {
    const observer = new MutationObserver(() => { if (installStyles()) observer.disconnect(); });
    observer.observe(document, { childList: true, subtree: true });
  }
  // Nested CSS scrollports do not update WebView.scrollY. Vote for smooth UI
  // rendering through a coalesced pair of hints for each scroll/fling, not IPC
  // on each display frame. Idle pages and native video retain platform policy.
  let scrollTimer;
  let scrolling = false;
  const endScroll = () => {
    clearTimeout(scrollTimer);
    scrollTimer = undefined;
    if (scrolling) { scrolling = false; send({ type: 'scrolling', value: false }); }
  };
  const onScroll = () => {
    if (document.hidden) return;
    if (!scrolling) { scrolling = true; send({ type: 'scrolling', value: true }); }
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(endScroll, 240);
  };
  const onScrollVisibility = () => { if (document.hidden) endScroll(); };
  document.addEventListener('scroll', onScroll, { capture: true, passive: true });
  document.addEventListener('visibilitychange', onScrollVisibility);
  const disposeTouchControls = __TOUCH_CONTROLS__(document, window.navigatorDesktop);
  window.addEventListener('pagehide', () => {
    disposeTouchControls();
    document.removeEventListener('scroll', onScroll, { capture: true });
    document.removeEventListener('visibilitychange', onScrollVisibility);
    endScroll();
    if (session) send({ type: 'stop', session });
    send({ type: 'visible', value: false });
  });
  send({ type: 'hello' });
})();
