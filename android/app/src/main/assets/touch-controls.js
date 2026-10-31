// Compatibility for the hosted UI until its React touch controls are deployed.
// Updated players declare data-touch-controls and own visibility themselves.
(function installTouchControls(document, bridge) {
  const controlsSelector = '[data-slot="media-player-controls"]';
  const interactive = `${controlsSelector}, button, a, input, select, textarea, [role="button"], [contenteditable="true"], [role="slider"], [role="menu"], [role="dialog"]`;
  const openMenu = '[data-state="open"]:is([role="menu"], [role="dialog"], [data-slot="popover-content"])';
  let root, timer, session, ready = false, paused = true, shown = true, held = false, pointer = 'mouse';
  const clear = () => { clearTimeout(timer); timer = undefined; };
  const paint = () => {
    if (!root) return;
    root.setAttribute('data-android-controls', shown ? 'visible' : 'hidden');
    for (const controls of root.querySelectorAll(controlsSelector)) {
      controls.inert = !shown;
      controls.setAttribute('aria-hidden', String(!shown));
    }
  };
  const busy = () => {
    const focused = document.activeElement;
    return held || document.querySelector(openMenu) || (focused && root?.contains(focused) &&
      focused.closest(controlsSelector) && focused.matches(':focus-visible'));
  };
  const hide = () => {
    if (!root || paused || !ready) return;
    if (busy()) { timer = setTimeout(hide, 1000); return; }
    shown = false;
    paint();
  };
  const show = () => {
    clear();
    shown = true;
    paint();
    if (root && ready && !paused) timer = setTimeout(hide, 3000);
  };
  const detach = () => {
    clear();
    if (root) {
      root.removeAttribute('data-android-controls');
      for (const controls of root.querySelectorAll(controlsSelector)) {
        controls.inert = false;
        controls.removeAttribute('aria-hidden');
      }
    }
    root = undefined;
    held = false;
  };
  const scan = () => {
    const next = document.querySelector('[data-slot="media-player"]:not([data-touch-controls])');
    if (next !== root) { detach(); root = next; if (root) show(); }
    else paint(); // New controls inserted during React rendering inherit visibility.
  };
  const down = event => {
    pointer = event.pointerType;
    if (!root) return;
    if (root.contains(event.target) && event.target.closest(controlsSelector)) {
      held = true;
      show();
    } else if (event.target.closest(openMenu)) show();
  };
  const up = () => { if (held) { held = false; show(); } };
  const move = event => {
    pointer = event.pointerType;
    if (pointer === 'mouse' && root?.contains(event.target)) show();
  };
  const click = event => {
    if (!root?.contains(event.target) || event.defaultPrevented || event.detail === 0 || pointer === 'mouse') return;
    if (event.target.closest(interactive)) { show(); return; }
    event.preventDefault();
    event.stopPropagation(); // Consume before the old React video play/pause handler.
    clear();
    if (shown) { shown = false; paint(); } else show();
  };
  const key = event => { if (root?.contains(event.target)) show(); };
  const handlers = { pointerdown: down, pointerup: up, pointercancel: up, pointermove: move, click, keydown: key };
  for (const [type, handler] of Object.entries(handlers)) document.addEventListener(type, handler, true);
  const unsubscribe = bridge.subscribe(message => {
    if (!message.session) return;
    if (message.type === 'state') {
      const nextPaused = !!message.state.paused;
      if (session !== message.session) { session = message.session; ready = false; paused = nextPaused; show(); }
      else if (paused !== nextPaused) { paused = nextPaused; show(); }
      // Position/buffer updates must never rearm or cancel the idle timer.
    } else if (message.session === session && message.type === 'ready') {
      ready = true;
      show();
    } else if (message.session === session && ['ended', 'error'].includes(message.type)) {
      ready = false;
      show();
    }
  });
  const observer = new MutationObserver(scan);
  observer.observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-touch-controls'] });
  scan();
  return () => {
    observer.disconnect();
    unsubscribe();
    for (const [type, handler] of Object.entries(handlers)) document.removeEventListener(type, handler, true);
    detach();
  };
})
