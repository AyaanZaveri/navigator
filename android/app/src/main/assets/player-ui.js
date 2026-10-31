// Compatibility with the hosted UI; layout updates are bounded to actual size
// changes and player mount/unmount, never playback's progress text updates.
(function installPlayerUI(document, window, send) {
  let controls, last = '';
  const mark = (node, name) => { if (node && !node.hasAttribute(name)) node.setAttribute(name, ''); };
  const report = () => {
    if (!controls) return;
    const rect = controls.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const values = [rect.top, rect.bottom, window.innerWidth, window.innerHeight].map(value => Math.round(value * 10) / 10);
    const key = values.join(',');
    if (key === last) return;
    last = key;
    send({ type: 'player-layout', top: values[0], bottom: values[1], viewportWidth: values[2], viewportHeight: values[3] });
  };
  const resize = new ResizeObserver(report);
  const decorate = () => {
    const shell = document.querySelector('[data-native-player-shell]');
    const next = shell?.querySelector('[data-slot="media-player-controls"]');
    if (next !== controls) {
      resize.disconnect(); controls = next; last = '';
      if (controls) resize.observe(controls);
    }
    if (!shell) return;
    for (const button of shell.querySelectorAll('button[aria-label="Close player"], button[data-player-close]')) {
      mark(button, 'data-player-close');
      if (button.getAttribute('aria-label') !== 'Back to browsing') button.setAttribute('aria-label', 'Back to browsing');
      for (const node of button.childNodes) {
        if (node.nodeType === 3 && node.textContent.trim() === 'Go Back') node.textContent = 'Back';
      }
    }
    for (const heading of shell.querySelectorAll('h2')) {
      mark(heading, 'data-player-title');
      const loading = heading.closest('[class~="bottom-8"][class~="left-8"][class~="right-8"]');
      if (loading) {
        mark(loading, 'data-player-loading-copy');
        const series = heading.parentElement.nextElementSibling;
        if (series?.tagName === 'P') mark(series, 'data-player-loading-series');
      }
    }
    const title = controls?.querySelector('h2');
    if (title) {
      mark(title, 'data-player-title'); mark(title.parentElement, 'data-player-heading-row');
      for (const sibling of title.parentElement.children) if (sibling !== title) mark(sibling, 'data-player-end-time');
      mark(title.parentElement.nextElementSibling, 'data-player-meta');
    }
    const toolbar = controls?.lastElementChild;
    if (toolbar?.querySelector('button')) mark(toolbar, 'data-player-toolbar');
    report();
  };
  const observer = new MutationObserver((records = []) => {
    if (!records.length || records.some(record => [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1))) decorate();
  });
  observer.observe(document, { childList: true, subtree: true });
  window.addEventListener('resize', report, { passive: true });
  decorate();
  return () => { observer.disconnect(); resize.disconnect(); window.removeEventListener('resize', report); };
})
