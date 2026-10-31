(() => {
  const origin = __ORIGIN__;
  if (window.top !== window || location.origin !== origin || !window.NavigatorAndroid) return;
  const transport = window.NavigatorAndroid;
  const listeners = new Set();
  let fullscreen = false;
  let session = '';
  let visible;
  const send = message => transport.postMessage(JSON.stringify(message));
  transport.onmessage = event => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
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
  window.addEventListener('pagehide', () => {
    if (session) send({ type: 'stop', session });
    send({ type: 'visible', value: false });
  });
  send({ type: 'hello' });
})();
