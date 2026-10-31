// Keep Android's ahead-of-time Back callback in sync with Next.js history and
// portalled overlays, without adding history entries or changing Next's state.
(function installBackNavigation(document, window, send) {
  const selector = '[role="menu"], [role="dialog"], section[aria-label="Ask Navigator"]';
  let disposed = false, previous;
  const overlay = () => [...document.querySelectorAll(selector)].reverse().find(node => {
    if (node.inert || node.getAttribute('data-state') === 'closed') return false;
    const trigger = document.getElementById(node.getAttribute('aria-labelledby'));
    if (trigger?.getAttribute('aria-expanded') === 'false') return false;
    return node.getClientRects().length > 0;
  });
  const publish = (force = false) => {
    if (disposed) return;
    const open = !!overlay();
    if (force || open !== previous) { previous = open; send({ type: 'navigation', overlayOpen: open }); }
  };
  const history = window.history;
  const originals = new Map();
  for (const name of ['pushState', 'replaceState']) {
    if (!history?.[name]) continue;
    const original = history[name];
    const wrapped = function (...args) {
      const result = Reflect.apply(original, this, args);
      publish(true);
      return result;
    };
    originals.set(name, { original, wrapped });
    history[name] = wrapped;
  }
  const changed = () => publish(true);
  window.addEventListener('popstate', changed);
  window.addEventListener('pageshow', changed);
  const observer = new MutationObserver((records = []) => {
    // Ignore progress/transcript text and unrelated card insertions.
    if (!records.length || records.some(record => record.type === 'attributes' ||
      [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1 &&
        (node.matches(selector) || node.querySelector(selector))))) publish();
  });
  observer.observe(document, { subtree: true, childList: true, attributes: true,
    attributeFilter: ['aria-expanded', 'aria-modal', 'data-state'] });
  publish(true);
  return {
    dismiss() {
      const node = overlay();
      if (!node) { publish(true); return; }
      if (node.matches('section[aria-label="Ask Navigator"]')) {
        const handled = !document.dispatchEvent(new Event('navigatornativeback', { cancelable: true }));
        if (!handled) document.documentElement.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true, button: 0 }));
      } else {
        node.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
      }
    },
    dispose() {
      disposed = true;
      observer.disconnect();
      window.removeEventListener('popstate', changed);
      window.removeEventListener('pageshow', changed);
      for (const [name, { original, wrapped }] of originals) {
        if (history[name] === wrapped) history[name] = original;
      }
    },
  };
})
